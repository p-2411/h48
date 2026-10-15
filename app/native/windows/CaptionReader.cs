// Duet caption reader for Windows.
//
// Uses Windows UI Automation, the same accessibility surface used by screen readers, to find the
// active Chromium video page, its seek slider and visible subtitle text. It speaks the same JSON
// lines protocol as native/macos/CaptionReader.swift, so the Electron app remains platform-neutral.
// Two differences: the status's "bundle" is the browser's process id (what the audio reader,
// AudioReader.cs, listens to), and a frame is in physical pixels, not points.
//
// Build with scripts/build-native.mjs on Windows. Run with --self-test to verify the executable and
// JSON protocol without requiring a browser.

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

internal static class CaptionReader
{
    private sealed class BrowserDefinition
    {
        public readonly string ProcessName;
        public readonly string DisplayName;

        public BrowserDefinition(string processName, string displayName)
        {
            ProcessName = processName;
            DisplayName = displayName;
        }
    }

    private sealed class Target
    {
        public Process Process;
        public IntPtr Window;
        public AutomationElement Root;
        public AutomationElement Document;
        public AutomationElement Progress;
        public AutomationElement PlayButton;
        public string Browser;
        public string Url;
        public string Title;
        public string Caption;
        public double? Position;
        public bool Playing;
    }

    private static readonly BrowserDefinition[] Browsers =
    {
        new BrowserDefinition("chrome", "Google Chrome"),
        new BrowserDefinition("msedge", "Microsoft Edge"),
        new BrowserDefinition("brave", "Brave"),
        new BrowserDefinition("arc", "Arc")
    };

    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private static readonly ConcurrentQueue<Dictionary<string, object>> Commands =
        new ConcurrentQueue<Dictionary<string, object>>();
    private static string _lastStatus = "";
    private static string _lastCaption = null;
    private static string _lastTime = "";
    private static string _lastFrame = "";
    private static Target _current;

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    private delegate bool WindowVisitor(IntPtr window, IntPtr data);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(WindowVisitor visitor, IntPtr data);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int length);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

    private const byte VK_LEFT = 0x25;
    private const byte VK_RIGHT = 0x27;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    private static long NowMilliseconds()
    {
        return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
    }

    private static void Emit(IDictionary<string, object> value)
    {
        Console.WriteLine(Json.Serialize(value));
        Console.Out.Flush();
    }

    private static void EmitStatus(IDictionary<string, object> fields)
    {
        string serialized = Json.Serialize(fields);
        if (serialized == _lastStatus) return;
        _lastStatus = serialized;
        Console.WriteLine(serialized);
        Console.Out.Flush();
    }

    // The supported sites, as in the macOS reader's `sites` table and src/main/sources.
    private static readonly string[] Sites = { "youtube.com", "netflix.com", "disneyplus.com", "crunchyroll.com" };

    private static bool IsOn(Uri uri, string site)
    {
        string host = uri.Host.ToLowerInvariant();
        return host == site || host.EndsWith("." + site);
    }

    private static bool SupportedAddress(string address)
    {
        Uri uri;
        if (!Uri.TryCreate(address, UriKind.Absolute, out uri)) return false;
        return Sites.Any(site => IsOn(uri, site));
    }

    private static string ValueOf(AutomationElement element)
    {
        if (element == null) return null;
        object pattern;
        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
            return ((ValuePattern)pattern).Current.Value;
        return null;
    }

    private static string AddressFrom(AutomationElement root, AutomationElement document)
    {
        try
        {
            AutomationElementCollection edits = root.FindAll(
                TreeScope.Descendants,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
            foreach (AutomationElement edit in edits)
            {
                string name = (edit.Current.Name ?? "").ToLowerInvariant();
                string automationId = (edit.Current.AutomationId ?? "").ToLowerInvariant();
                if (!name.Contains("address") && !name.Contains("search bar") &&
                    !automationId.Contains("address")) continue;
                string candidate = ValueOf(edit);
                if (SupportedAddress(candidate)) return candidate;
                if (!String.IsNullOrWhiteSpace(candidate) &&
                    Sites.Any(site => candidate.Contains(site)))
                {
                    candidate = "https://" + candidate.TrimStart('/');
                    if (SupportedAddress(candidate)) return candidate;
                }
            }

            string documentValue = ValueOf(document);
            return SupportedAddress(documentValue) ? documentValue : null;
        }
        catch (ElementNotAvailableException)
        {
            return null;
        }
    }

    private static AutomationElement FindDocument(AutomationElement root)
    {
        return root.FindFirst(
            TreeScope.Descendants,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
    }

    private static bool IsVideoAddress(string address)
    {
        Uri uri;
        if (!Uri.TryCreate(address, UriKind.Absolute, out uri)) return false;
        // After an optional locale ("/en-gb/play/…"), as in src/main/sources/address.ts.
        string path = Regex.Replace(uri.AbsolutePath, "^/[a-z]{2}(?:-[a-z]{2})?(?=/)", "", RegexOptions.IgnoreCase);
        if (IsOn(uri, "youtube.com"))
            return uri.AbsolutePath == "/watch" || uri.AbsolutePath.StartsWith("/shorts/", StringComparison.Ordinal);
        if (IsOn(uri, "netflix.com")) return uri.AbsolutePath.StartsWith("/watch/", StringComparison.Ordinal);
        if (IsOn(uri, "disneyplus.com"))
            return path.StartsWith("/play/", StringComparison.Ordinal) || path.StartsWith("/video/", StringComparison.Ordinal);
        return IsOn(uri, "crunchyroll.com") && path.StartsWith("/watch/", StringComparison.Ordinal);
    }

    // Captions and the player are read on YouTube and Netflix only. Disney+ and Crunchyroll are heard
    // from the start and never read (their captions are images or hidden), as on macOS.
    private static bool ReadsPlayer(string address)
    {
        Uri uri;
        return IsVideoAddress(address) && Uri.TryCreate(address, UriKind.Absolute, out uri) &&
               (IsOn(uri, "youtube.com") || IsOn(uri, "netflix.com"));
    }

    private static AutomationElement FindProgress(AutomationElement document)
    {
        if (document == null) return null;
        AutomationElementCollection sliders = document.FindAll(
            TreeScope.Descendants,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Slider));
        AutomationElement fallback = null;
        foreach (AutomationElement slider in sliders)
        {
            string name = (slider.Current.Name ?? "").ToLowerInvariant();
            if (name.Contains("seek") || name.Contains("progress") || name.Contains("scrubber"))
                return slider;
            if (fallback == null) fallback = slider;
        }
        return fallback;
    }

    private static AutomationElement FindPlayButton(AutomationElement document)
    {
        if (document == null) return null;
        AutomationElementCollection buttons = document.FindAll(
            TreeScope.Descendants,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button));
        foreach (AutomationElement button in buttons)
        {
            string name = (button.Current.Name ?? "").Trim().ToLowerInvariant();
            if (name == "play" || name == "pause" || name.StartsWith("play ") || name.StartsWith("pause "))
                return button;
        }
        return null;
    }

    private static double? PositionOf(AutomationElement slider)
    {
        if (slider == null) return null;
        try
        {
            object pattern;
            if (slider.TryGetCurrentPattern(RangeValuePattern.Pattern, out pattern))
                return ((RangeValuePattern)pattern).Current.Value;
            double value;
            return Double.TryParse(ValueOf(slider), NumberStyles.Float, CultureInfo.InvariantCulture, out value)
                ? (double?)value
                : null;
        }
        catch (ElementNotAvailableException)
        {
            return null;
        }
    }

    private static bool PlayingFrom(AutomationElement button)
    {
        if (button == null) return false;
        try
        {
            string name = (button.Current.Name ?? "").Trim().ToLowerInvariant();
            return name == "pause" || name.StartsWith("pause ");
        }
        catch (ElementNotAvailableException)
        {
            return false;
        }
    }

    private static bool UsefulCaptionText(string text)
    {
        if (String.IsNullOrWhiteSpace(text)) return false;
        string compact = text.Trim();
        if (compact.Length > 350) return false;
        string lowered = compact.ToLowerInvariant();
        string[] chrome = { "play", "pause", "mute", "settings", "full screen", "exit full screen", "subtitles", "closed captions" };
        return !chrome.Contains(lowered);
    }

    // Captions in Chromium are exposed as visible Text elements above the seek slider. YouTube uses
    // its transcript for timing in Duet, but this also covers on-screen-only sites such as Netflix.
    private static string CaptionFrom(AutomationElement document, AutomationElement progress)
    {
        if (document == null) return "";
        try
        {
            System.Windows.Rect documentRect = document.Current.BoundingRectangle;
            System.Windows.Rect progressRect = progress == null
                ? System.Windows.Rect.Empty
                : progress.Current.BoundingRectangle;
            if (documentRect.IsEmpty) return "";

            double videoBottom = progressRect.IsEmpty
                ? documentRect.Top + documentRect.Height * 0.78
                : progressRect.Top;
            double videoLeft = progressRect.IsEmpty ? documentRect.Left : progressRect.Left;
            double videoRight = progressRect.IsEmpty ? documentRect.Right : progressRect.Right;
            double bandTop = Math.Max(documentRect.Top, videoBottom - Math.Min(360, documentRect.Height * 0.55));
            double bandBottom = videoBottom - 18;

            AutomationElementCollection texts = document.FindAll(
                TreeScope.Descendants,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text));
            List<Tuple<double, double, string>> pieces = new List<Tuple<double, double, string>>();
            foreach (AutomationElement element in texts)
            {
                if (element.Current.IsOffscreen) continue;
                string text = element.Current.Name;
                if (!UsefulCaptionText(text)) continue;
                System.Windows.Rect rect = element.Current.BoundingRectangle;
                if (rect.IsEmpty || rect.Top < bandTop || rect.Bottom > bandBottom) continue;
                double centre = rect.Left + rect.Width / 2;
                if (centre < videoLeft || centre > videoRight) continue;
                pieces.Add(Tuple.Create(rect.Top, rect.Left, text.Trim()));
            }

            return String.Join(" ", pieces
                .OrderBy(piece => piece.Item1)
                .ThenBy(piece => piece.Item2)
                .Select(piece => piece.Item3)
                .Distinct()
                .ToArray());
        }
        catch (ElementNotAvailableException)
        {
            return "";
        }
    }

    // Where the video is on screen, in physical pixels (the app turns them into its own units): on
    // YouTube the player around the seek bar, elsewhere the page itself (Netflix's, Disney+'s and
    // Crunchyroll's watch pages are all video), as the macOS reader does. Chromium gives each page
    // element its HTML classes as its UI Automation class name.
    private static System.Windows.Rect? VideoRect(Target target)
    {
        try
        {
            if (!IsVideoAddress(target.Url)) return null;
            Uri uri;
            if (!Uri.TryCreate(target.Url, UriKind.Absolute, out uri) || !IsOn(uri, "youtube.com"))
                return target.Document.Current.BoundingRectangle;
            AutomationElement element = target.Progress;
            for (int level = 0; element != null && level < 20; level++)
            {
                if ((element.Current.ClassName ?? "").Split(' ').Contains("html5-video-player"))
                    return element.Current.BoundingRectangle;
                element = TreeWalker.RawViewWalker.GetParent(element);
            }
        }
        catch (ElementNotAvailableException)
        {
        }
        return null;
    }

    // Sends where the video is, when that changed: no place when there is none, or most of it is
    // scrolled out of the page.
    private static void ReportFrame(Target target)
    {
        Dictionary<string, object> fields = new Dictionary<string, object> { { "type", "frame" } };
        System.Windows.Rect? video = target == null ? null : VideoRect(target);
        if (video.HasValue && !video.Value.IsEmpty)
        {
            System.Windows.Rect page = target.Document.Current.BoundingRectangle;
            System.Windows.Rect seen = System.Windows.Rect.Intersect(video.Value, page);
            if (!seen.IsEmpty && seen.Height >= video.Value.Height * 0.5 && video.Value.Width >= 200 && video.Value.Height >= 120)
            {
                fields.Add("x", (int)Math.Round(video.Value.X));
                fields.Add("y", (int)Math.Round(video.Value.Y));
                fields.Add("width", (int)Math.Round(video.Value.Width));
                fields.Add("height", (int)Math.Round(video.Value.Height));
            }
        }
        string serialized = Json.Serialize(fields);
        if (serialized == _lastFrame) return;
        _lastFrame = serialized;
        Emit(fields);
    }

    // The browsers' visible windows, front to back (EnumWindows goes in z-order), so the foreground
    // one comes first. Every window counts, not only each browser's main one: the video may be in any.
    private static List<Tuple<BrowserDefinition, Process, IntPtr>> BrowserWindows()
    {
        Dictionary<int, Tuple<BrowserDefinition, Process>> owners = new Dictionary<int, Tuple<BrowserDefinition, Process>>();
        foreach (BrowserDefinition browser in Browsers)
        {
            foreach (Process process in Process.GetProcessesByName(browser.ProcessName))
                owners[process.Id] = Tuple.Create(browser, process);
        }
        List<Tuple<BrowserDefinition, Process, IntPtr>> windows = new List<Tuple<BrowserDefinition, Process, IntPtr>>();
        EnumWindows((window, data) =>
        {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            Tuple<BrowserDefinition, Process> owner;
            if (IsWindowVisible(window) && owners.TryGetValue((int)processId, out owner) && TitleOf(window) != "")
                windows.Add(Tuple.Create(owner.Item1, owner.Item2, window));
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    private static string TitleOf(IntPtr window)
    {
        StringBuilder title = new StringBuilder(512);
        GetWindowText(window, title, title.Capacity);
        return title.ToString();
    }

    // The first browser window showing a video on a supported site, else the first on a supported site.
    private static Target FindTarget()
    {
        Target fallback = null;
        foreach (Tuple<BrowserDefinition, Process, IntPtr> candidate in BrowserWindows())
        {
            try
            {
                AutomationElement root = AutomationElement.FromHandle(candidate.Item3);
                AutomationElement document = FindDocument(root);
                if (document == null) continue;
                string address = AddressFrom(root, document);
                if (!SupportedAddress(address)) continue;
                Target target = new Target
                {
                    Process = candidate.Item2,
                    Window = candidate.Item3,
                    Root = root,
                    Document = document,
                    Browser = candidate.Item1.DisplayName,
                    Url = address,
                    Title = TitleOf(candidate.Item3),
                    Caption = ""
                };
                if (ReadsPlayer(address))
                {
                    target.Progress = FindProgress(document);
                    target.PlayButton = FindPlayButton(document);
                    target.Position = PositionOf(target.Progress);
                    target.Playing = PlayingFrom(target.PlayButton);
                    target.Caption = CaptionFrom(document, target.Progress);
                }
                if (IsVideoAddress(address)) return target;
                if (fallback == null) fallback = target;
            }
            catch (Exception error)
            {
                if (!(error is ElementNotAvailableException) && !(error is InvalidOperationException))
                    Debug.WriteLine(error);
            }
        }
        return fallback;
    }

    private static void HandleCommands(Target target)
    {
        Dictionary<string, object> command;
        while (Commands.TryDequeue(out command))
        {
            object rawType;
            if (!command.TryGetValue("type", out rawType)) continue;
            string type = Convert.ToString(rawType, CultureInfo.InvariantCulture);
            try
            {
                if ((type == "pause" || type == "play") && target != null && target.PlayButton != null)
                {
                    bool wantsPlaying = type == "play";
                    if (target.Playing != wantsPlaying)
                    {
                        object pattern;
                        if (target.PlayButton.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
                            ((InvokePattern)pattern).Invoke();
                    }
                }
                else if (type == "seek" && target != null && target.Progress != null)
                {
                    object rawSeconds;
                    object rawFrom;
                    object rawPlay;
                    if (command.TryGetValue("seconds", out rawSeconds))
                    {
                        double? from = command.TryGetValue("from", out rawFrom) && rawFrom != null
                            ? Convert.ToDouble(rawFrom, CultureInfo.InvariantCulture)
                            : (double?)null;
                        bool play = command.TryGetValue("play", out rawPlay) && rawPlay is bool && (bool)rawPlay;
                        Seek(target, Convert.ToDouble(rawSeconds, CultureInfo.InvariantCulture), from, play);
                    }
                }
            }
            catch (Exception error)
            {
                Debug.WriteLine(error);
            }
        }
    }

    // How many steps of `size` seconds go `distance` seconds. Going back always lands on or before
    // the point, however close it is (a replay must hear the line's start); going forward lands just
    // before, and a little short is close enough. As in the macOS reader.
    private static int Steps(double distance, double size)
    {
        if (distance < -0.3) return (int)Math.Ceiling(-distance / size);
        if (distance > 1.5) return (int)Math.Floor(distance / size);
        return 0;
    }

    // Seeking: set the seek bar's value. Chrome ignores that on a page's own slider (YouTube's and
    // Netflix's are), so when the bar didn't move, the browser comes to the front, the bar takes the
    // focus, and the arrow keys step it (5 seconds each on YouTube, 10 on Netflix), as the macOS
    // reader steps it with the bar's own actions. Duet starts this reader, so Windows lets it bring
    // the browser forward even while Duet's strip has just been clicked. Then play, if asked.
    private static void Seek(Target target, double seconds, double? from, bool play)
    {
        object pattern;
        if (target.Progress.TryGetCurrentPattern(RangeValuePattern.Pattern, out pattern))
        {
            RangeValuePattern range = (RangeValuePattern)pattern;
            double before = range.Current.Value;
            try
            {
                range.SetValue(seconds);
            }
            catch (Exception error)
            {
                Debug.WriteLine(error);
            }
            Thread.Sleep(300);
            double now = range.Current.Value;
            if (Math.Abs(before - seconds) > 0.3 && Math.Abs(now - seconds) >= Math.Abs(before - seconds) - 0.5)
            {
                double distance = seconds - (from.HasValue ? from.Value : now);
                double step = target.Url != null && target.Url.Contains("netflix.com") ? 10.0 : 5.0;
                int count = Steps(distance, step);
                if (count > 0)
                {
                    SetForegroundWindow(target.Window);
                    target.Progress.SetFocus();
                    byte key = distance < 0 ? VK_LEFT : VK_RIGHT;
                    for (int index = 0; index < count; index++)
                    {
                        keybd_event(key, 0, 0, UIntPtr.Zero);
                        keybd_event(key, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                        Thread.Sleep(40);
                    }
                }
            }
        }
        if (play && !target.Playing && target.PlayButton != null)
        {
            object invoke;
            if (target.PlayButton.TryGetCurrentPattern(InvokePattern.Pattern, out invoke))
                ((InvokePattern)invoke).Invoke();
        }
    }

    private static void ReadCommands()
    {
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            try
            {
                Dictionary<string, object> command = Json.Deserialize<Dictionary<string, object>>(line);
                if (command != null) Commands.Enqueue(command);
            }
            catch (ArgumentException)
            {
                // Ignore malformed input; the app sends one isolated JSON command per line.
            }
        }
        // stdin closed: the app went away, so stop rather than keep reading the browser on our own.
        Environment.Exit(0);
    }

    private static void SelfTest()
    {
        long now = NowMilliseconds();
        Emit(new Dictionary<string, object>
        {
            { "type", "status" }, { "trusted", true }, { "browser", "Windows self-test" },
            { "url", "https://www.youtube.com/watch?v=duet-test" }, { "title", "Duet test" },
            { "captions", true }, { "available", true }
        });
        Emit(new Dictionary<string, object>
        {
            { "type", "caption" }, { "text", "こんにちは" },
            { "url", "https://www.youtube.com/watch?v=duet-test" }, { "at", now }
        });
        Emit(new Dictionary<string, object>
        {
            { "type", "time" }, { "t", 42.0 }, { "playing", true }, { "ad", false },
            { "url", "https://www.youtube.com/watch?v=duet-test" }, { "at", now }
        });
    }

    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        // Physical pixels everywhere, whatever each display's scaling (per-monitor v2, Windows 10
        // 1703+; else the system scaling), so the video's place is the same on every display.
        try
        {
            if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware();
        }
        catch (EntryPointNotFoundException)
        {
            SetProcessDPIAware();
        }
        if (args.Contains("--self-test"))
        {
            SelfTest();
            return 0;
        }

        Thread input = new Thread(ReadCommands);
        input.IsBackground = true;
        input.Start();

        while (true)
        {
            Target target = FindTarget();
            _current = target;
            if (target == null)
            {
                EmitStatus(new Dictionary<string, object>
                {
                    { "type", "status" }, { "trusted", true }, { "captions", false }
                });
                if (_lastCaption != null && _lastCaption != "")
                {
                    _lastCaption = "";
                    Emit(new Dictionary<string, object>
                    {
                        { "type", "caption" }, { "text", "" }, { "at", NowMilliseconds() }
                    });
                }
            }
            else
            {
                EmitStatus(new Dictionary<string, object>
                {
                    { "type", "status" }, { "trusted", true }, { "browser", target.Browser },
                    // On Windows the browser's process id, which the audio reader listens to.
                    { "bundle", target.Process.Id.ToString(CultureInfo.InvariantCulture) },
                    { "url", target.Url }, { "title", target.Title },
                    { "captions", !String.IsNullOrWhiteSpace(target.Caption) }, { "available", true }
                });

                if (target.Caption != _lastCaption)
                {
                    _lastCaption = target.Caption;
                    Emit(new Dictionary<string, object>
                    {
                        { "type", "caption" }, { "text", target.Caption }, { "url", target.Url },
                        { "browser", target.Browser }, { "at", NowMilliseconds() }
                    });
                }

                if (target.Position.HasValue)
                {
                    Dictionary<string, object> time = new Dictionary<string, object>
                    {
                        { "type", "time" }, { "t", target.Position.Value },
                        { "playing", target.Playing }, { "ad", false }, { "url", target.Url }
                    };
                    string serialized = Json.Serialize(time);
                    if (serialized != _lastTime)
                    {
                        _lastTime = serialized;
                        time.Add("at", NowMilliseconds());
                        Emit(time);
                    }
                }
            }

            ReportFrame(target);
            HandleCommands(_current);
            Thread.Sleep(250);
        }
    }
}
