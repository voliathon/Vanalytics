using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Middleware;

public partial class OpenGraphMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IWebHostEnvironment _env;
    private string? _templateHtml;

    private static readonly string[] SkipPrefixes =
        ["/api", "/item-images", "/forum-attachments", "/health", "/openapi"];

    public OpenGraphMiddleware(RequestDelegate next, IWebHostEnvironment env)
    {
        _next = next;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Method != "GET")
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? "/";

        if (SkipPrefixes.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            await _next(context);
            return;
        }

        if (Path.HasExtension(path))
        {
            await _next(context);
            return;
        }

        _templateHtml ??= await File.ReadAllTextAsync(
            Path.Combine(_env.WebRootPath, "index.html"));

        var db = context.RequestServices.GetRequiredService<VanalyticsDbContext>();
        var baseUrl = $"{context.Request.Scheme}://{context.Request.Host}";
        var fullUrl = $"{baseUrl}{path}";

        var tags = await ResolveOpenGraphTags(db, path, baseUrl, fullUrl);
        var html = InjectTags(_templateHtml, tags);

        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync(html);
    }

    private async Task<OgTags> ResolveOpenGraphTags(
        VanalyticsDbContext db, string path, string baseUrl, string fullUrl)
    {
        var defaultImage = $"{baseUrl}/vanalytics-square-logo.png";

        var itemMatch = ItemRouteRegex().Match(path);
        if (itemMatch.Success && int.TryParse(itemMatch.Groups[1].Value, out var itemId))
        {
            var item = await db.GameItems
                .Where(i => i.ItemId == itemId)
                .Select(i => new { i.Name, i.Category, i.Level, i.ItemLevel, i.IconPath })
                .FirstOrDefaultAsync();

            if (item != null)
            {
                var descParts = new List<string> { item.Category };
                if (item.Level.HasValue) descParts.Add($"Lv.{item.Level}");
                if (item.ItemLevel.HasValue) descParts.Add($"iLv.{item.ItemLevel}");

                var image = !string.IsNullOrEmpty(item.IconPath)
                    ? $"{baseUrl}/item-images/{item.IconPath}"
                    : defaultImage;

                return new OgTags(
                    Title: $"{item.Name} — Vanalytics",
                    Description: string.Join(" · ", descParts),
                    Image: image,
                    Url: fullUrl,
                    Type: "website");
            }
        }

        var segments = path.Trim('/').Split('/');
        if (segments.Length == 2
            && !string.IsNullOrEmpty(segments[0])
            && !string.IsNullOrEmpty(segments[1]))
        {
            var server = segments[0];
            var name = segments[1];

            var isServer = await db.GameServers
                .AnyAsync(s => s.Name == server);

            if (isServer)
            {
                var character = await db.Characters
                    .Where(c => c.Server == server && c.Name == name && c.IsPublic)
                    .Select(c => new
                    {
                        c.Name,
                        c.Server,
                        c.Race,
                        c.Gender,
                        c.SubJob,
                        c.SubJobLevel,
                        c.MasterLevel,
                        c.ItemLevel,
                        ActiveJob = c.Jobs.Where(j => j.IsActive)
                            .Select(j => new { j.JobId, j.Level })
                            .FirstOrDefault()
                    })
                    .FirstOrDefaultAsync();

                if (character != null)
                {
                    var descParts = new List<string>();
                    if (character.Race.HasValue)
                    {
                        var raceStr = character.Race.ToString()!;
                        if (character.Gender.HasValue
                            && character.Race != Vanalytics.Core.Enums.Race.Mithra
                            && character.Race != Vanalytics.Core.Enums.Race.Galka)
                            raceStr += $" {character.Gender}";
                        descParts.Add(raceStr);
                    }

                    if (character.ActiveJob != null)
                    {
                        var jobStr = $"{character.ActiveJob.JobId}{character.ActiveJob.Level}";
                        if (!string.IsNullOrEmpty(character.SubJob))
                            jobStr += $"/{character.SubJob}{character.SubJobLevel}";
                        descParts.Add(jobStr);
                    }

                    if (character.MasterLevel is > 0)
                        descParts.Add($"ML{character.MasterLevel}");
                    if (character.ItemLevel is > 0)
                        descParts.Add($"iLv{character.ItemLevel}");

                    return new OgTags(
                        Title: $"{character.Name} · {character.Server} — Vanalytics",
                        Description: string.Join(" · ", descParts),
                        Image: defaultImage,
                        Url: fullUrl,
                        Type: "profile");
                }
            }
        }

        return new OgTags(
            Title: "Vana'lytics",
            Description: "Character tracker, model viewer, and in-game tools for Final Fantasy XI.",
            Image: defaultImage,
            Url: fullUrl,
            Type: "website");
    }

    private static string InjectTags(string template, OgTags tags)
    {
        var meta = $"""
            <title>{Encode(tags.Title)}</title>
            <meta property="og:title" content="{Encode(tags.Title)}" />
            <meta property="og:description" content="{Encode(tags.Description)}" />
            <meta property="og:image" content="{Encode(tags.Image)}" />
            <meta property="og:url" content="{Encode(tags.Url)}" />
            <meta property="og:type" content="{tags.Type}" />
            <meta property="og:site_name" content="Vanalytics" />
            """;

        var html = Regex.Replace(template, @"<title>[^<]*</title>", "");
        html = html.Replace("</head>", $"{meta}</head>");
        return html;
    }

    private static string Encode(string value) =>
        System.Net.WebUtility.HtmlEncode(value);

    [GeneratedRegex(@"^/items/(\d+)$", RegexOptions.IgnoreCase)]
    private static partial Regex ItemRouteRegex();

    private record OgTags(string Title, string Description, string Image, string Url, string Type);
}
