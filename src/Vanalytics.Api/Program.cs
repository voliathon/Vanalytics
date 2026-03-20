using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;
using Vanalytics.Data.Seeding;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<VanalyticsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

var app = builder.Build();

// Apply migrations and seed admin on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    await db.Database.MigrateAsync();

    var adminEmail = app.Configuration["ADMIN_EMAIL"];
    var adminUsername = app.Configuration["ADMIN_USERNAME"];
    var adminPassword = app.Configuration["ADMIN_PASSWORD"];

    if (!string.IsNullOrEmpty(adminEmail) &&
        !string.IsNullOrEmpty(adminUsername) &&
        !string.IsNullOrEmpty(adminPassword))
    {
        var hash = BCrypt.Net.BCrypt.HashPassword(adminPassword);
        await AdminSeeder.SeedAsync(db, adminEmail, adminUsername, hash, logger);
    }
}

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();
