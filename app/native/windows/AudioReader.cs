// Duet audio reader for Windows.
//
// Listens to the browser's sound (not the microphone) through WASAPI, and keeps the last minute in
// memory, so that when the learner asks about a line, the app can have that line's audio. Nothing is
// written to disk, and nothing leaves this process unless the app asks for a clip. It only listens
// while the app says a video is being watched. It speaks the same JSON lines as
// native/macos/AudioReader/main.swift, so src/main/audio.ts works the same on both.
//
// On Windows 10 2004 (build 19041) and later it hears only the browser: a process loopback of the
// browser's process and all its children (Chromium plays its sound from a child process). Where that
// is not possible it falls back to everything the default speakers play (a system loopback), which
// includes other apps and Duet's own voice; the status says which ("heard": "browser" or "system").
// Windows asks no permission for either, so the permission is "granted" unless Windows refuses.
//
// Protocol: one JSON object per line.
//   stdin  {"type":"listen","bundle":"1234"}   listen to the browser with this process id (the
//                                              caption reader's "bundle" on Windows)
//          {"type":"stop"}                     stop listening
//          {"type":"request"}                  nothing to ask on Windows; answers with the status
//          {"type":"clip","id":7,"from":1791…,"to":1791…}   the audio between two times (ms since 1970)
//   stdout {"type":"status","permission":"granted","listening":true,"heard":"browser"}
//          {"type":"clip","id":7,"wav":"<base64 16 kHz mono WAV>","level":0.04}  or  {"type":"clip","id":7,"error":"…"}
//
// Build with scripts/build-native.mjs on Windows. Run with --self-test to check the recording and the
// WAV it sends, with no browser and no sound device.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// MARK: WASAPI, as much of it as is used here

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator
{
    void EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    void GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumerator
{
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice
{
    void Activate(ref Guid iid, int context, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object activated);
    void OpenPropertyStore(int access, out IntPtr properties);
    void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}

[ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioClient
{
    void Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
    void GetBufferSize(out uint frames);
    void GetStreamLatency(out long latency);
    void GetCurrentPadding(out uint frames);
    [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
    void GetMixFormat(out IntPtr format);
    void GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
    void Start();
    void Stop();
    void Reset();
    void SetEventHandle(IntPtr handle);
    void GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioCaptureClient
{
    void GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong counterPosition);
    void ReleaseBuffer(uint frames);
    void GetNextPacketSize(out uint frames);
}

[ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IActivateAudioInterfaceAsyncOperation
{
    void GetActivateResult(out int result, [MarshalAs(UnmanagedType.IUnknown)] out object activated);
}

[ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IActivateAudioInterfaceCompletionHandler
{
    void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation);
}

// Windows calls the completion handler on one of its own threads, so the handler must say it can be
// called from any thread.
[ComImport, Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAgileObject
{
}

public sealed class Activation : IActivateAudioInterfaceCompletionHandler, IAgileObject
{
    public readonly ManualResetEvent Done = new ManualResetEvent(false);

    public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
    {
        Done.Set();
    }
}

internal static class Wasapi
{
    public static readonly Guid AudioClient = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
    public static readonly Guid AudioCaptureClient = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
    public const string ProcessLoopbackDevice = "VAD\\Process_Loopback";
    public const int SharedMode = 0;
    public const uint Loopback = 0x00020000;
    public const uint EventCallback = 0x00040000;
    public const uint AutoConvertPcm = 0x80000000;
    public const uint SrcDefaultQuality = 0x08000000;
    public const uint SilentBuffer = 0x2;
    public const int AccessDenied = unchecked((int)0x80070005);
    // How much sound WASAPI holds between two reads: 100 ms, in units of 100 ns.
    public const long BufferDuration = 1000000;

    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
    public static extern void ActivateAudioInterfaceAsync(
        [In, MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        [In, MarshalAs(UnmanagedType.LPStruct)] Guid iid,
        [In] IntPtr activationParams,
        [In] IActivateAudioInterfaceCompletionHandler handler,
        out IActivateAudioInterfaceAsyncOperation operation);
}

// MARK: Sound formats

/** The shape of the samples WASAPI hands over. */
internal sealed class SoundFormat
{
    public int Rate;
    public int Channels;
    public int Bits;
    public bool Float;

    public int FrameBytes { get { return Channels * Bits / 8; } }

    static readonly Guid FloatSubtype = new Guid("00000003-0000-0010-8000-00AA00389B71");
    static readonly Guid PcmSubtype = new Guid("00000001-0000-0010-8000-00AA00389B71");

    /** Reads a WAVEFORMATEX (or WAVEFORMATEXTENSIBLE). */
    public static SoundFormat Read(IntPtr format)
    {
        int tag = Marshal.ReadInt16(format, 0) & 0xFFFF;
        SoundFormat result = new SoundFormat
        {
            Channels = Marshal.ReadInt16(format, 2),
            Rate = Marshal.ReadInt32(format, 4),
            Bits = Marshal.ReadInt16(format, 14)
        };
        if (tag == 0xFFFE)
        {
            byte[] subtype = new byte[16];
            Marshal.Copy(IntPtr.Add(format, 24), subtype, 0, 16);
            Guid kind = new Guid(subtype);
            if (kind == FloatSubtype) result.Float = true;
            else if (kind != PcmSubtype) throw new NotSupportedException("Unknown sound format " + kind);
        }
        else if (tag == 3) result.Float = true;
        else if (tag != 1) throw new NotSupportedException("Unknown sound format " + tag);
        if (!(result.Float && result.Bits == 32) && !(!result.Float && (result.Bits == 16 || result.Bits == 32)))
            throw new NotSupportedException(result.Bits + "-bit sound");
        return result;
    }

    /** A WAVEFORMATEX for 16-bit PCM, freed with Marshal.FreeHGlobal. */
    public IntPtr Write()
    {
        IntPtr format = Marshal.AllocHGlobal(18);
        Marshal.WriteInt16(format, 0, 1);
        Marshal.WriteInt16(format, 2, (short)Channels);
        Marshal.WriteInt32(format, 4, Rate);
        Marshal.WriteInt32(format, 8, Rate * FrameBytes);
        Marshal.WriteInt16(format, 12, (short)FrameBytes);
        Marshal.WriteInt16(format, 14, (short)Bits);
        Marshal.WriteInt16(format, 16, 0);
        return format;
    }

    /** The frames at `data` mixed down to mono, into `mono` (grown when too small). */
    public void ToMono(IntPtr data, int frames, bool silent, ref float[] mono)
    {
        if (mono.Length < frames) mono = new float[frames];
        if (silent || data == IntPtr.Zero)
        {
            Array.Clear(mono, 0, frames);
            return;
        }
        int count = frames * Channels;
        if (Float)
        {
            float[] samples = new float[count];
            Marshal.Copy(data, samples, 0, count);
            for (int frame = 0; frame < frames; frame++)
            {
                float sum = 0;
                for (int channel = 0; channel < Channels; channel++) sum += samples[frame * Channels + channel];
                mono[frame] = sum / Channels;
            }
        }
        else if (Bits == 16)
        {
            short[] samples = new short[count];
            Marshal.Copy(data, samples, 0, count);
            for (int frame = 0; frame < frames; frame++)
            {
                float sum = 0;
                for (int channel = 0; channel < Channels; channel++) sum += samples[frame * Channels + channel] / 32768f;
                mono[frame] = sum / Channels;
            }
        }
        else
        {
            int[] samples = new int[count];
            Marshal.Copy(data, samples, 0, count);
            for (int frame = 0; frame < frames; frame++)
            {
                float sum = 0;
                for (int channel = 0; channel < Channels; channel++) sum += samples[frame * Channels + channel] / 2147483648f;
                mono[frame] = sum / Channels;
            }
        }
    }
}

// MARK: The last minute of sound, mono, 16 kHz

internal sealed class Recording
{
    public const int Rate = 16000;
    const int Kept = Rate * 60;
    // A gap longer than this between what was kept and newer sound is kept as silence.
    const int GapSamples = Rate / 5;

    readonly float[] _samples = new float[Kept];
    readonly object _lock = new object();
    long _written;          // samples ever written
    double _newestAt;       // ms since 1970 of the newest sample
    // Resampling state: position in the source stream, carried between buffers.
    double _sourcePosition;
    float _previous;

    /** `count` mono samples at `rate`, the newest of them heard at `at`. */
    public void Append(float[] input, int count, double rate, double at)
    {
        lock (_lock)
        {
            double step = rate / Rate;
            // A process loopback sends nothing while the browser plays nothing: keep that as silence,
            // so that times still match the samples.
            if (_written > 0) Silence(at - (count - _sourcePosition) / step * 1000.0 / Rate);
            while (_sourcePosition < count)
            {
                int index = (int)_sourcePosition;
                float fraction = (float)(_sourcePosition - index);
                float before = index == 0 ? _previous : input[index - 1];
                _samples[_written % Kept] = before + (input[index] - before) * fraction;
                _written++;
                _sourcePosition += step;
            }
            _sourcePosition -= count;
            if (count > 0) _previous = input[count - 1];
            _newestAt = at;
        }
    }

    /** Silence from the newest sample up to `until`, when more than a moment is missing. */
    void Silence(double until)
    {
        long missing = (long)((until - _newestAt) / 1000.0 * Rate);
        if (missing < GapSamples) return;
        for (long index = Math.Max(0, missing - Kept); index < missing; index++) _samples[(_written + index) % Kept] = 0;
        _written += missing;
        _newestAt = until;
        _previous = 0;
    }

    public void Reset()
    {
        lock (_lock)
        {
            _written = 0;
            _newestAt = 0;
            _sourcePosition = 0;
            _previous = 0;
        }
    }

    /** The samples heard between two times, if they are still kept. `now` is the time of asking. */
    public float[] Clip(double from, double to, double now)
    {
        lock (_lock)
        {
            if (_written == 0) return null;
            // Nothing new for a while: the browser is quiet. Leave a little for sound still on its way.
            Silence(now - 100);
            long end = _written - (long)((_newestAt - Math.Min(to, _newestAt)) / 1000.0 * Rate);
            long start = _written - (long)((_newestAt - from) / 1000.0 * Rate);
            long oldest = Math.Max(0, _written - Kept);
            if (start < oldest || end <= start) return null;
            float[] clip = new float[end - start];
            for (long index = start; index < end; index++) clip[index - start] = _samples[index % Kept];
            return clip;
        }
    }

    public static byte[] Wav(float[] samples)
    {
        using (MemoryStream stream = new MemoryStream(44 + samples.Length * 2))
        using (BinaryWriter writer = new BinaryWriter(stream))
        {
            writer.Write(Encoding.ASCII.GetBytes("RIFF"));
            writer.Write(36 + samples.Length * 2);
            writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
            writer.Write(16);
            writer.Write((short)1);
            writer.Write((short)1);
            writer.Write(Rate);
            writer.Write(Rate * 2);
            writer.Write((short)2);
            writer.Write((short)16);
            writer.Write(Encoding.ASCII.GetBytes("data"));
            writer.Write(samples.Length * 2);
            foreach (float sample in samples) writer.Write((short)(Math.Max(-1f, Math.Min(1f, sample)) * 32767));
            writer.Flush();
            return stream.ToArray();
        }
    }

    public static double Level(float[] samples)
    {
        double sum = 0;
        foreach (float sample in samples) sum += sample * sample;
        return Math.Sqrt(sum / Math.Max(samples.Length, 1));
    }
}

// MARK: Listening

internal sealed class Listener
{
    public readonly Recording Recording = new Recording();
    readonly AutoResetEvent _changed = new AutoResetEvent(false);
    readonly object _lock = new object();
    readonly Action _statusChanged;
    string _wanted;
    bool _listening;
    bool _denied;
    string _heard;

    public Listener(Action statusChanged)
    {
        _statusChanged = statusChanged;
    }

    public bool Listening { get { lock (_lock) return _listening; } }
    public bool Denied { get { lock (_lock) return _denied; } }
    public string Heard { get { lock (_lock) return _heard; } }

    /** Listens to the browser with this process id, or stops listening when null. */
    public void Listen(string bundle)
    {
        lock (_lock) _wanted = String.IsNullOrWhiteSpace(bundle) ? null : bundle.Trim();
        _changed.Set();
    }

    string Wanted { get { lock (_lock) return _wanted; } }

    void SetState(bool listening, string heard, bool denied)
    {
        lock (_lock)
        {
            _listening = listening;
            _heard = heard;
            _denied = denied;
        }
        _statusChanged();
    }

    /** The capture thread: hears what is wanted, rebuilding when it changes or the sound device goes. */
    public void Run()
    {
        while (true)
        {
            string wanted = Wanted;
            if (wanted == null)
            {
                _changed.WaitOne();
                continue;
            }
            try
            {
                Capture(wanted);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("Listening stopped: " + error.Message);
                bool denied = error is COMException && ((COMException)error).ErrorCode == Wasapi.AccessDenied ||
                              error is UnauthorizedAccessException;
                SetState(false, null, denied);
                // Try again in a moment (a sound device being changed), or as soon as the app asks.
                _changed.WaitOne(2000);
            }
        }
    }

    void Capture(string wanted)
    {
        SoundFormat format;
        string heard = "browser";
        string device = null;
        int process;
        IAudioClient client = Int32.TryParse(wanted, NumberStyles.None, CultureInfo.InvariantCulture, out process)
            ? BrowserLoopback(process, out format)
            : null;
        if (client == null)
        {
            heard = "system";
            client = SystemLoopback(out format, out device);
        }
        AutoResetEvent ready = new AutoResetEvent(false);
        IAudioCaptureClient capture = null;
        try
        {
            if (heard == "browser") client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle());
            Guid iid = Wasapi.AudioCaptureClient;
            object service;
            client.GetService(ref iid, out service);
            capture = (IAudioCaptureClient)service;
            client.Start();
            Recording.Reset();
            SetState(true, heard, false);
            float[] mono = new float[4096];
            int checkedAt = Environment.TickCount;
            WaitHandle[] waits = { ready, _changed };
            while (true)
            {
                // Woken by WASAPI (browser), or every 10 ms anyway (system loopback has no event).
                if (WaitHandle.WaitAny(waits, 10) == 1 && Wanted != wanted) return;
                uint size;
                capture.GetNextPacketSize(out size);
                while (size > 0)
                {
                    IntPtr data;
                    uint frames, flags;
                    ulong devicePosition, counterPosition;
                    capture.GetBuffer(out data, out frames, out flags, out devicePosition, out counterPosition);
                    format.ToMono(data, (int)frames, (flags & Wasapi.SilentBuffer) != 0, ref mono);
                    capture.ReleaseBuffer(frames);
                    Recording.Append(mono, (int)frames, format.Rate, Program.Now());
                    capture.GetNextPacketSize(out size);
                }
                // The system loopback hears the default speakers: follow them when they change.
                if (device != null && Environment.TickCount - checkedAt > 3000)
                {
                    checkedAt = Environment.TickCount;
                    if (DefaultSpeakersId() != device) return;
                }
            }
        }
        finally
        {
            try
            {
                client.Stop();
            }
            catch (COMException)
            {
            }
            if (capture != null) Marshal.ReleaseComObject(capture);
            Marshal.ReleaseComObject(client);
            ready.Dispose();
            Recording.Reset();
            SetState(false, null, false);
        }
    }

    /** The browser's sound and its children's (Windows 10 2004+), or null where that isn't possible. */
    static IAudioClient BrowserLoopback(int process, out SoundFormat format)
    {
        format = new SoundFormat { Rate = 44100, Channels = 2, Bits = 16 };
        // AUDIOCLIENT_ACTIVATION_PARAMS: process loopback (1) of this process and its children (0).
        IntPtr parameters = Marshal.AllocHGlobal(12);
        // A PROPVARIANT holding them as a blob (VT_BLOB): its size, then a pointer to it.
        IntPtr variant = Marshal.AllocHGlobal(24);
        IntPtr wave = format.Write();
        try
        {
            Marshal.WriteInt32(parameters, 0, 1);
            Marshal.WriteInt32(parameters, 4, process);
            Marshal.WriteInt32(parameters, 8, 0);
            for (int offset = 0; offset < 24; offset += 4) Marshal.WriteInt32(variant, offset, 0);
            Marshal.WriteInt16(variant, 0, 65);
            Marshal.WriteInt32(variant, 8, 12);
            Marshal.WriteIntPtr(variant, 8 + IntPtr.Size, parameters);

            Activation activation = new Activation();
            IActivateAudioInterfaceAsyncOperation operation;
            Wasapi.ActivateAudioInterfaceAsync(Wasapi.ProcessLoopbackDevice, Wasapi.AudioClient, variant, activation, out operation);
            if (!activation.Done.WaitOne(5000)) throw new TimeoutException("Windows did not open the browser's sound.");
            int result;
            object activated;
            operation.GetActivateResult(out result, out activated);
            Marshal.ThrowExceptionForHR(result);
            IAudioClient client = (IAudioClient)activated;
            client.Initialize(Wasapi.SharedMode,
                Wasapi.Loopback | Wasapi.EventCallback | Wasapi.AutoConvertPcm | Wasapi.SrcDefaultQuality,
                Wasapi.BufferDuration, 0, wave, IntPtr.Zero);
            return client;
        }
        catch (Exception error)
        {
            // Older Windows has no process loopback (EntryPointNotFound or an error from Windows).
            Console.Error.WriteLine("Can't hear the browser alone, so hearing the speakers: " + error.Message);
            return null;
        }
        finally
        {
            Marshal.FreeHGlobal(wave);
            Marshal.FreeHGlobal(variant);
            Marshal.FreeHGlobal(parameters);
        }
    }

    static IMMDevice DefaultSpeakers()
    {
        IMMDeviceEnumerator devices = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        IMMDevice device;
        // eRender (0), eConsole (0).
        devices.GetDefaultAudioEndpoint(0, 0, out device);
        return device;
    }

    static string DefaultSpeakersId()
    {
        try
        {
            string id;
            DefaultSpeakers().GetId(out id);
            return id;
        }
        catch (COMException)
        {
            return null;
        }
    }

    /** Everything the default speakers play. */
    static IAudioClient SystemLoopback(out SoundFormat format, out string id)
    {
        IMMDevice device = DefaultSpeakers();
        device.GetId(out id);
        Guid iid = Wasapi.AudioClient;
        object activated;
        // CLSCTX_ALL
        device.Activate(ref iid, 0x17, IntPtr.Zero, out activated);
        IAudioClient client = (IAudioClient)activated;
        IntPtr mix;
        client.GetMixFormat(out mix);
        try
        {
            format = SoundFormat.Read(mix);
            client.Initialize(Wasapi.SharedMode, Wasapi.Loopback, Wasapi.BufferDuration, 0, mix, IntPtr.Zero);
        }
        finally
        {
            Marshal.FreeCoTaskMem(mix);
        }
        return client;
    }
}

internal static class Program
{
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = Int32.MaxValue };
    static readonly object OutputLock = new object();
    static Listener _listener;
    static string _lastStatus = "";

    public static double Now()
    {
        return (DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
    }

    static void Emit(IDictionary<string, object> value)
    {
        string line = Json.Serialize(value);
        lock (OutputLock)
        {
            Console.Out.Write(line + "\n");
            Console.Out.Flush();
        }
    }

    static void ReportStatus()
    {
        Dictionary<string, object> status = new Dictionary<string, object>
        {
            { "type", "status" },
            { "permission", _listener.Denied ? "denied" : "granted" },
            { "listening", _listener.Listening }
        };
        if (_listener.Heard != null) status.Add("heard", _listener.Heard);
        string key = Json.Serialize(status);
        lock (OutputLock)
        {
            if (key == _lastStatus) return;
            _lastStatus = key;
        }
        Emit(status);
    }

    static void Handle(string line)
    {
        Dictionary<string, object> message;
        try
        {
            message = Json.Deserialize<Dictionary<string, object>>(line);
        }
        catch (ArgumentException)
        {
            return;
        }
        object type;
        if (message == null || !message.TryGetValue("type", out type)) return;
        switch (Convert.ToString(type, CultureInfo.InvariantCulture))
        {
            case "listen":
                object bundle;
                message.TryGetValue("bundle", out bundle);
                _listener.Listen(bundle == null ? null : Convert.ToString(bundle, CultureInfo.InvariantCulture));
                break;
            case "stop":
                _listener.Listen(null);
                break;
            case "clip":
                Clip(message);
                break;
        }
        ReportStatus();
    }

    static void Clip(Dictionary<string, object> message)
    {
        object id, from, to;
        message.TryGetValue("id", out id);
        float[] samples = message.TryGetValue("from", out from) && message.TryGetValue("to", out to) && from != null && to != null
            ? _listener.Recording.Clip(Convert.ToDouble(from, CultureInfo.InvariantCulture), Convert.ToDouble(to, CultureInfo.InvariantCulture), Now())
            : null;
        if (samples == null)
        {
            Emit(new Dictionary<string, object>
            {
                { "type", "clip" }, { "id", id ?? 0 }, { "error", "That part is no longer kept, or nothing was heard." }
            });
            return;
        }
        Emit(new Dictionary<string, object>
        {
            { "type", "clip" }, { "id", id ?? 0 },
            { "wav", Convert.ToBase64String(Recording.Wav(samples)) }, { "level", Recording.Level(samples) }
        });
    }

    // Records two half seconds of a tone, one second apart, as the browser's 16-bit stereo 44.1 kHz,
    // and checks the clip of all of it: two seconds at 16 kHz, the gap kept as silence.
    static int SelfTest()
    {
        SoundFormat format = new SoundFormat { Rate = 44100, Channels = 2, Bits = 16 };
        Recording recording = new Recording();
        int frames = 441;  // 10 ms
        short[] packet = new short[frames * 2];
        IntPtr data = Marshal.AllocHGlobal(packet.Length * 2);
        float[] mono = new float[frames];
        double start = 1700000000000;
        int written = 0;
        foreach (double from in new[] { 0.0, 1500.0 })
        {
            for (int index = 0; index < 50; index++)
            {
                for (int frame = 0; frame < frames; frame++)
                {
                    short value = (short)(Math.Sin(2 * Math.PI * 440 * (written + frame) / 44100.0) * 16000);
                    packet[frame * 2] = value;
                    packet[frame * 2 + 1] = value;
                }
                written += frames;
                Marshal.Copy(packet, 0, data, packet.Length);
                format.ToMono(data, frames, false, ref mono);
                recording.Append(mono, frames, format.Rate, start + from + (index + 1) * 10);
            }
        }
        Marshal.FreeHGlobal(data);
        float[] clip = recording.Clip(start, start + 2000, start + 2000);
        float[] gap = recording.Clip(start + 700, start + 1300, start + 2000);
        byte[] wav = Recording.Wav(clip ?? new float[0]);
        Emit(new Dictionary<string, object>
        {
            { "type", "self-test" },
            { "samples", clip == null ? 0 : clip.Length },
            { "level", clip == null ? 0 : Recording.Level(clip) },
            { "gapLevel", gap == null ? -1 : Recording.Level(gap) },
            { "wavBytes", wav.Length }
        });
        return 0;
    }

    [MTAThread]
    static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Contains("--self-test")) return SelfTest();

        _listener = new Listener(ReportStatus);
        Thread capture = new Thread(_listener.Run);
        capture.IsBackground = true;
        capture.Start();
        ReportStatus();

        string line;
        while ((line = Console.ReadLine()) != null)
        {
            if (line.Trim().Length > 0) Handle(line);
        }
        // stdin closed: the app went away, so stop rather than keep listening on our own.
        return 0;
    }
}
