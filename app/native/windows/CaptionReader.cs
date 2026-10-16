// Duet caption reader for Windows.
//
// Uses Windows UI Automation, the same accessibility surface used by screen readers, to find the
// active Chromium video page, its seek slider and visible subtitle text. It speaks the same JSON
// lines protocol as native/macos/CaptionReader.swift, so the Electron app remains platform-neutral.
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
    private static Target _current;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

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

    private static bool SupportedAddress(string address)
    {
        Uri uri;
        if (!Uri.TryCreate(address, UriKind.Absolute, out uri)) return false;
        string host = uri.Host.ToLowerInvariant();
        return host == "youtube.com" || host.EndsWith(".youtube.com") ||
               host == "netflix.com" || host.EndsWith(".netflix.com");
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
                    (candidate.Contains("youtube.com") || candidate.Contains("netflix.com")))
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
        string host = uri.Host.ToLowerInvariant();
        if (host.EndsWith("youtube.com"))
            return uri.AbsolutePath == "/watch" || uri.AbsolutePath.StartsWith("/shorts/", StringComparison.Ordinal);
        return host.EndsWith("netflix.com") && uri.AbsolutePath.StartsWith("/watch/", StringComparison.Ordinal);
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
        if (chrome.Contains(lowered)) return false;
        // The player's own overlays are never speech: a skip ("+15", "-10", "10 seconds"), a time
        // ("1:23 / 4:56"), the volume ("80%").
        return !PlayerOverlay.IsMatch(compact);
    }

    private static readonly System.Text.RegularExpressions.Regex PlayerOverlay =
        new System.Text.RegularExpressions.Regex(
            @"^([+\-−]\s*\d+(\s*(s|sec|secs|seconds?))?|\d+\s*(s|sec|secs|seconds?)|\d+(:\d{2})+(\s*/\s*\d+(:\d{2})+)?|\d+\s*%)$",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    // The players' caption elements, by the class Chromium exposes for each element: YouTube's
    // ytp-caption-window-container (around its caption windows; Chromium leaves the spans inside out
    // of the tree) and Netflix's player-timedtext (and its text container, should either be left out).
    // Only text inside one of these is a caption. Anything else drawn over the video (YouTube's "+15"
    // skip bubble, a chapter title, an end-screen card) is the player's own, however close to the
    // bottom it sits; and the captions are found wherever they are (YouTube lowers them when its
    // controls hide, below where the seek bar was, and lets the viewer drag them anywhere).
    private static readonly string[] CaptionContainers = { "ytp-caption-window-container", "player-timedtext", "player-timedtext-text-container" };
    // For --probe: whether a piece of text is inside a caption element, by any of the players' caption
    // classes on it or up to CaptionDepth elements above it.
    private static readonly string[] CaptionClasses = { "ytp-caption", "caption-window", "captions-text", "player-timedtext" };
    private const int CaptionDepth = 5;

    private static bool InCaption(AutomationElement element)
    {
        TreeWalker walker = TreeWalker.RawViewWalker;
        AutomationElement node = element;
        for (int depth = 0; node != null && depth <= CaptionDepth; depth++)
        {
            string classes = node.Current.ClassName ?? "";
            foreach (string caption in CaptionClasses)
                if (classes.IndexOf(caption, StringComparison.Ordinal) >= 0) return true;
            node = walker.GetParent(node);
        }
        return false;
    }

    private static readonly Condition CaptionCondition = new OrCondition(
        CaptionContainers
            .Select(name => (Condition)new PropertyCondition(AutomationElement.ClassNameProperty, name))
            .ToArray());
    private static readonly Condition TextCondition =
        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text);

    // The caption on screen: the text of the players' caption elements (CaptionContainers), in reading
    // order (top to bottom, then left to right), every word kept (auto captions repeat words, and each
    // can be its own piece of text). YouTube uses its transcript for timing in Duet, but this also
    // covers on-screen-only sites such as Netflix.
    private static string CaptionFrom(AutomationElement document)
    {
        if (document == null) return "";
        try
        {
            List<Tuple<double, double, string>> pieces = new List<Tuple<double, double, string>>();
            // A piece found through two containers (one inside the other) counts once.
            HashSet<string> seen = new HashSet<string>();
            // The containers are unnamed layout groups, which the default (control) view leaves out: look in
            // the raw view for them.
            AutomationElementCollection containers;
            CacheRequest raw = new CacheRequest { TreeFilter = Automation.RawViewCondition, AutomationElementMode = AutomationElementMode.Full };
            using (raw.Activate()) containers = document.FindAll(TreeScope.Descendants, CaptionCondition);
            foreach (AutomationElement container in containers)
            {
                if (container.Current.IsOffscreen) continue;
                AutomationElementCollection texts = container.FindAll(TreeScope.Descendants, TextCondition);
                IEnumerable<AutomationElement> parts = texts.Count > 0
                    ? texts.Cast<AutomationElement>()
                    : new[] { container };
                foreach (AutomationElement part in parts)
                {
                    string text = part.Current.Name;
                    if (!UsefulCaptionText(text)) continue;
                    System.Windows.Rect rect = part.Current.BoundingRectangle;
                    if (rect.IsEmpty) continue;
                    if (!seen.Add(String.Join(",", part.GetRuntimeId()))) continue;
                    pieces.Add(Tuple.Create(Math.Round(rect.Top), rect.Left, text.Trim()));
                }
            }
            return String.Join(" ", pieces
                .OrderBy(piece => piece.Item1)
                .ThenBy(piece => piece.Item2)
                .Select(piece => piece.Item3)
                .ToArray());
        }
        catch (ElementNotAvailableException)
        {
            return "";
        }
    }

    // Duet's own process (its windows are its main process's): pressing the strip brings Duet to the
    // front, and that mustn't count as leaving the video. Given by the app (--duet-pid).
    private static uint _duetPid;
    // The browser window last in front on a video page, kept while Duet's own window is in front.
    private static IntPtr _watched = IntPtr.Zero;

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);

    // Only the video the learner is watching: the browser window in front (any of a browser's windows,
    // not only its first), or the one that was in front just before Duet's own strip or window was
    // clicked. A video left playing in a window behind another app, or minimized, isn't read, nor is
    // another browser's (a tab in the background isn't either: a window only shows its active tab).
    private static Target FindTarget()
    {
        IntPtr window = GetForegroundWindow();
        uint processId;
        GetWindowThreadProcessId(window, out processId);
        if (_duetPid != 0 && processId == _duetPid)
        {
            window = _watched;
            if (window == IntPtr.Zero || !IsWindow(window) || IsIconic(window)) return null;
            GetWindowThreadProcessId(window, out processId);
        }

        Process process;
        try
        {
            process = Process.GetProcessById((int)processId);
        }
        catch (ArgumentException)
        {
            return null;
        }
        BrowserDefinition browser = Browsers.FirstOrDefault(
            item => String.Equals(item.ProcessName, process.ProcessName, StringComparison.OrdinalIgnoreCase));
        if (browser == null) return null;

        try
        {
            AutomationElement root = AutomationElement.FromHandle(window);
            AutomationElement document = FindDocument(root);
            if (document == null) return null;
            string address = AddressFrom(root, document);
            if (!IsVideoAddress(address)) return null;
            _watched = window;
            AutomationElement progress = FindProgress(document);
            AutomationElement play = FindPlayButton(document);
            return new Target
            {
                Process = process,
                Window = window,
                Root = root,
                Document = document,
                Progress = progress,
                PlayButton = play,
                Browser = browser.DisplayName,
                Url = address,
                Title = root.Current.Name ?? "",
                Position = PositionOf(progress),
                Playing = PlayingFrom(play),
                Caption = CaptionFrom(document)
            };
        }
        catch (Exception error)
        {
            if (!(error is ElementNotAvailableException) && !(error is InvalidOperationException))
                Debug.WriteLine(error);
            return null;
        }
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

    private static string RectText(AutomationElement element)
    {
        if (element == null) return null;
        System.Windows.Rect rect = element.Current.BoundingRectangle;
        return rect.IsEmpty ? "empty" : String.Format(CultureInfo.InvariantCulture, "{0:0},{1:0} {2:0}x{3:0}", rect.Left, rect.Top, rect.Width, rect.Height);
    }

    private static void Probe()
    {
        Target target = FindTarget();
        if (target == null)
        {
            Emit(new Dictionary<string, object> { { "type", "probe" }, { "found", false } });
            return;
        }
        List<Dictionary<string, object>> texts = new List<Dictionary<string, object>>();
        foreach (AutomationElement element in target.Document.FindAll(
            TreeScope.Descendants,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text)))
        {
            if (element.Current.IsOffscreen) continue;
            string text = (element.Current.Name ?? "").Trim();
            if (text.Length == 0 || text.Length > 80) continue;
            System.Windows.Rect rect = element.Current.BoundingRectangle;
            texts.Add(new Dictionary<string, object>
            {
                { "text", text }, { "top", Math.Round(rect.Top) }, { "useful", UsefulCaptionText(text) },
                { "inCaption", InCaption(element) }
            });
        }
        Emit(new Dictionary<string, object>
        {
            { "type", "probe" }, { "found", true }, { "url", target.Url }, { "caption", target.Caption },
            { "document", RectText(target.Document) }, { "progress", RectText(target.Progress) },
            { "progressName", target.Progress == null ? null : target.Progress.Current.Name },
            { "texts", texts }
        });
    }

    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Contains("--self-test"))
        {
            SelfTest();
            return 0;
        }
        // --probe: once, what the reader would take as the caption on the browser's video page now,
        // and every piece of text it looked at with why it kept it or not (for working on the reader).
        if (args.Contains("--probe"))
        {
            Probe();
            return 0;
        }

        int pidAt = Array.IndexOf(args, "--duet-pid");
        if (pidAt >= 0 && pidAt + 1 < args.Length) UInt32.TryParse(args[pidAt + 1], out _duetPid);

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

            HandleCommands(_current);
            Thread.Sleep(250);
        }
    }
}
