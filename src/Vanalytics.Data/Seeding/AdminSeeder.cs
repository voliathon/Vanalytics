using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Seeding;

public static class AdminSeeder
{
    public static async Task SeedAsync(
        VanalyticsDbContext db,
        string email,
        string username,
        string passwordHash,
        ILogger logger)
    {
        if (await db.Users.AnyAsync(u => u.Email == email))
        {
            logger.LogInformation("Admin user already exists, skipping seed");
            return;
        }

        var admin = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = passwordHash,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Users.Add(admin);
        await db.SaveChangesAsync();
        logger.LogInformation("Admin user seeded: {Username}", username);
    }
}
