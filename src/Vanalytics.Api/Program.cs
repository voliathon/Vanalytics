using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Vanalytics.Api.Auth;
using Vanalytics.Api.Services;
using Vanalytics.Data;
using Vanalytics.Data.Seeding;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<VanalyticsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

// Authentication
builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
    })
    .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthHandler>("ApiKey", null);

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Services
builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<OAuthService>();
builder.Services.AddSingleton<RateLimiter>();
builder.Services.AddSingleton<EconomyRateLimiter>();
builder.Services.AddHttpClient("PlayOnline", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddHostedService<ServerStatusScraper>();
builder.Services.AddHostedService<ItemImageDownloader>();
builder.Services.AddHostedService<ItemDatabaseSyncJob>();

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

    // Seed item database (skip in integration tests via config)
    if (!string.Equals(app.Configuration["SKIP_ITEM_SEED"], "true", StringComparison.OrdinalIgnoreCase))
    {
        var httpFactory = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
        await ItemDatabaseSeeder.SeedAsync(db, httpFactory, logger);
    }
}

// HTTPS redirection in production (skipped when behind a reverse proxy
// that terminates TLS, e.g., Azure Container Apps + Cloudflare)
if (!app.Environment.IsDevelopment() &&
    !string.Equals(app.Configuration["DISABLE_HTTPS_REDIRECT"], "true", StringComparison.OrdinalIgnoreCase))
{
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();

// Make Program class accessible for WebApplicationFactory in tests
public partial class Program { }
