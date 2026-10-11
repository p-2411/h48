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

    private static Target FindTarget()
    {
        uint foregroundProcessId;
        GetWindowThreadProcessId(GetForegroundWindow(), out foregroundProcessId);
        List<Tuple<BrowserDefinition, Process>> candidates = new List<Tuple<BrowserDefinition, Process>>();
        foreach (BrowserDefinition browser in Browsers)
        {
            foreach (Process process in Process.GetProcessesByName(browser.ProcessName))
            {
                if (process.MainWindowHandle != IntPtr.Zero)
                    candidates.Add(Tuple.Create(browser, process));
            }
        }

        foreach (Tuple<BrowserDefinition, Process> candidate in candidates
            .OrderByDescending(item => item.Item2.Id == foregroundProcessId))
        {
            try
            {
                AutomationElement root = AutomationElement.FromHandle(candidate.Item2.MainWindowHandle);
                AutomationElement document = FindDocument(root);
                if (document == null) continue;
                string address = AddressFrom(root, document);
                if (!IsVideoAddress(address)) continue;
                AutomationElement progress = FindProgress(document);
                AutomationElement play = FindPlayButton(document);
                return new Target
                {
                    Process = candidate.Item2,
                    Root = root,
                    Document = document,
                    Progress = progress,
                    PlayButton = play,
                    Browser = candidate.Item1.DisplayName,
                    Url = address,
                    Title = candidate.Item2.MainWindowTitle ?? "",
                    Position = PositionOf(progress),
                    Playing = PlayingFrom(play),
                    Caption = CaptionFrom(document, progress)
                };
            }
            catch (Exception error)
            {
                if (!(error is ElementNotAvailableException) && !(error is InvalidOperationException))
                    Debug.WriteLine(error);
            }
        }
        return null;
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
                    object pattern;
                    if (command.TryGetValue("seconds", out rawSeconds) &&
                        target.Progress.TryGetCurrentPattern(RangeValuePattern.Pattern, out pattern))
                    {
                        ((RangeValuePattern)pattern).SetValue(Convert.ToDouble(rawSeconds, CultureInfo.InvariantCulture));
                    }
                }
            }
            catch (Exception error)
            {
                Debug.WriteLine(error);
            }
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

    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
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
