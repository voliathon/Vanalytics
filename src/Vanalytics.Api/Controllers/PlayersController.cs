using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.DTOs;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlayersController(VanalyticsDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetPlayers([FromQuery] string? server)
    {
        var query = db.Characters
            .Include(c => c.Jobs)
            .Where(c => c.IsPublic);

        if (!string.IsNullOrEmpty(server))
            query = query.Where(c => c.Server == server);

        var characters = await query.ToListAsync();

        var result = characters.Select(c =>
        {
            var activeJob = c.Jobs.FirstOrDefault(j => j.IsActive);
            return new PlayerListItem
            {
                Name = c.Name,
                Server = c.Server,
                Job = activeJob?.JobId.ToString(),
                Level = activeJob?.Level,
                Race = c.Race?.ToString(),
                Linkshell = c.Linkshell,
                LastSyncedAt = c.LastSyncAt,
            };
        }).OrderBy(p => p.Name).ToList();

        return Ok(result);
    }
}
