namespace Vanalytics.Api.DTOs;

public class ItemOwnerEntry
{
    public required string Name { get; init; }
    public required string Server { get; init; }
    public string? Job { get; init; }
    public int? Level { get; init; }
}

public class ItemOwnersResponse
{
    public required List<ItemOwnerEntry> Equipped { get; init; }
    public required List<ItemOwnerEntry> Inventory { get; init; }
}
