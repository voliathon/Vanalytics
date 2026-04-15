namespace Vanalytics.Api.Services;

public class MacroRateLimiter : RateLimiter
{
    public MacroRateLimiter() : base(maxRequests: 120, window: TimeSpan.FromHours(1))
    {
    }
}
