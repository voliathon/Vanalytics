using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Economy;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/economy")]
public class EconomyController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly EconomyRateLimiter _rateLimiter;

    public EconomyController(VanalyticsDbContext db, EconomyRateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost("ah")]
    [Authorize(AuthenticationSchemes = "ApiKey")]
    public async Task<IActionResult> IngestAh([FromBody] AhIngestionRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 120 requests per hour." });

        var server = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == request.Server);
        if (server is null)
            return BadRequest(new { message = $"Unknown server: {request.Server}" });

        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == request.ItemId);
        if (!itemExists)
            return BadRequest(new { message = $"Unknown item ID: {request.ItemId}" });

        var now = DateTimeOffset.UtcNow;
        var accepted = 0;
        var duplicates = 0;

        // Batch dedup: preload existing matching records in one query
        var saleDates = request.Sales.Select(s => s.SoldAt).Distinct().ToList();
        var existingSales = await _db.AuctionSales
            .Where(s => s.ItemId == request.ItemId && s.ServerId == server.Id)
            .Where(s => saleDates.Contains(s.SoldAt))
            .Select(s => new { s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize })
            .ToListAsync();

        var existingSet = new HashSet<string>(
            existingSales.Select(s => $"{s.Price}|{s.SoldAt:O}|{s.BuyerName}|{s.SellerName}|{s.StackSize}"));

        foreach (var sale in request.Sales)
        {
            var key = $"{sale.Price}|{sale.SoldAt:O}|{sale.BuyerName}|{sale.SellerName}|{sale.StackSize}";
            if (existingSet.Contains(key))
            {
                duplicates++;
                continue;
            }

            _db.AuctionSales.Add(new AuctionSale
            {
                ItemId = request.ItemId,
                ServerId = server.Id,
                Price = sale.Price,
                SoldAt = sale.SoldAt,
                SellerName = sale.SellerName,
                BuyerName = sale.BuyerName,
                StackSize = sale.StackSize,
                ReportedByUserId = userId,
                ReportedAt = now,
            });

            accepted++;
        }

        if (accepted > 0)
            await _db.SaveChangesAsync();

        return Ok(new AhIngestionResponse { Accepted = accepted, Duplicates = duplicates });
    }
}
