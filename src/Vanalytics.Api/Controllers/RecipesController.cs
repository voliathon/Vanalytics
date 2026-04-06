using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/recipes")]
public class RecipesController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public RecipesController(VanalyticsDbContext db)
    {
        _db = db;
    }

    // -------------------------------------------------------------------------
    // GET /api/recipes
    // -------------------------------------------------------------------------
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? craft = null,
        [FromQuery] int? minLevel = null,
        [FromQuery] int? maxLevel = null,
        [FromQuery] string? search = null,
        [FromQuery] int? ingredientItemId = null,
        [FromQuery] int? resultItemId = null,
        [FromQuery] bool includeDesynth = false,
        [FromQuery] bool includeIngredients = false,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDir = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        if (pageSize > 200) pageSize = 200;
        if (page < 1) page = 1;

        var query = _db.SynthRecipes.AsNoTracking().AsQueryable();

        // Desynth filter (default: exclude desynth recipes)
        if (!includeDesynth)
            query = query.Where(r => !r.IsDesynth);

        // Craft filter: e.g. craft=smith → Smith > 0
        if (!string.IsNullOrWhiteSpace(craft))
        {
            query = craft.Trim().ToLowerInvariant() switch
            {
                "wood"      => query.Where(r => r.Wood > 0),
                "smith"     => query.Where(r => r.Smith > 0),
                "gold"      => query.Where(r => r.Gold > 0),
                "cloth"     => query.Where(r => r.Cloth > 0),
                "leather"   => query.Where(r => r.Leather > 0),
                "bone"      => query.Where(r => r.Bone > 0),
                "alchemy"   => query.Where(r => r.Alchemy > 0),
                "cook"      => query.Where(r => r.Cook > 0),
                _ => query
            };
        }

        // Level filters based on craft columns.
        // minLevel: at least one craft column >= minLevel
        if (minLevel.HasValue)
        {
            var min = minLevel.Value;
            query = query.Where(r =>
                r.Wood >= min || r.Smith >= min || r.Gold >= min || r.Cloth >= min ||
                r.Leather >= min || r.Bone >= min || r.Alchemy >= min || r.Cook >= min);
        }

        // maxLevel: all non-zero craft columns <= maxLevel
        if (maxLevel.HasValue)
        {
            var max = maxLevel.Value;
            query = query.Where(r =>
                (r.Wood == 0    || r.Wood <= max) &&
                (r.Smith == 0   || r.Smith <= max) &&
                (r.Gold == 0    || r.Gold <= max) &&
                (r.Cloth == 0   || r.Cloth <= max) &&
                (r.Leather == 0 || r.Leather <= max) &&
                (r.Bone == 0    || r.Bone <= max) &&
                (r.Alchemy == 0 || r.Alchemy <= max) &&
                (r.Cook == 0    || r.Cook <= max));
        }

        // Search: match result item name OR any ingredient item name
        if (!string.IsNullOrWhiteSpace(search))
        {
            var matchingItemIds = await _db.GameItems
                .AsNoTracking()
                .Where(i => i.Name.Contains(search))
                .Select(i => i.ItemId)
                .ToListAsync();

            var ingredientRecipeIds = await _db.RecipeIngredients
                .AsNoTracking()
                .Where(ing => matchingItemIds.Contains(ing.ItemId))
                .Select(ing => ing.RecipeId)
                .Distinct()
                .ToListAsync();

            query = query.Where(r =>
                matchingItemIds.Contains(r.ResultItemId) ||
                ingredientRecipeIds.Contains(r.Id));
        }

        // Ingredient filter
        if (ingredientItemId.HasValue)
        {
            var recipeIds = await _db.RecipeIngredients
                .AsNoTracking()
                .Where(ing => ing.ItemId == ingredientItemId.Value)
                .Select(ing => ing.RecipeId)
                .Distinct()
                .ToListAsync();

            query = query.Where(r => recipeIds.Contains(r.Id));
        }

        // Result item filter
        if (resultItemId.HasValue)
            query = query.Where(r => r.ResultItemId == resultItemId.Value);

        var totalCount = await query.CountAsync();

        // Sorting
        var desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);

        if (string.Equals(sortBy, "name", StringComparison.OrdinalIgnoreCase))
        {
            // Join to GameItems for name ordering
            var nameOrdered = query.Join(
                _db.GameItems,
                r => r.ResultItemId,
                gi => gi.ItemId,
                (r, gi) => new { Recipe = r, ItemName = gi.Name });

            nameOrdered = desc
                ? nameOrdered.OrderByDescending(x => x.ItemName)
                : nameOrdered.OrderBy(x => x.ItemName);

            var pagedNamed = await nameOrdered
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(x => x.Recipe)
                .ToListAsync();

            var resultNamed = await BuildListResponse(pagedNamed, includeIngredients);
            return Ok(new { totalCount, page, pageSize, recipes = resultNamed });
        }
        else
        {
            // Default / "level": order by sum of all craft columns as proxy for primary level
            query = desc
                ? query.OrderByDescending(r => r.Wood + r.Smith + r.Gold + r.Cloth + r.Leather + r.Bone + r.Alchemy + r.Cook)
                : query.OrderBy(r => r.Wood + r.Smith + r.Gold + r.Cloth + r.Leather + r.Bone + r.Alchemy + r.Cook);
        }

        var paged = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var recipes = await BuildListResponse(paged, includeIngredients);
        return Ok(new { totalCount, page, pageSize, recipes });
    }

    // -------------------------------------------------------------------------
    // GET /api/recipes/{id}
    // -------------------------------------------------------------------------
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var recipe = await _db.SynthRecipes
            .AsNoTracking()
            .Include(r => r.Ingredients)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (recipe is null) return NotFound();

        // Collect all item IDs we need to resolve
        var itemIds = new HashSet<int> { recipe.CrystalItemId, recipe.ResultItemId };
        if (recipe.HqCrystalItemId.HasValue) itemIds.Add(recipe.HqCrystalItemId.Value);
        if (recipe.ResultHq1ItemId.HasValue) itemIds.Add(recipe.ResultHq1ItemId.Value);
        if (recipe.ResultHq2ItemId.HasValue) itemIds.Add(recipe.ResultHq2ItemId.Value);
        if (recipe.ResultHq3ItemId.HasValue) itemIds.Add(recipe.ResultHq3ItemId.Value);
        foreach (var ing in recipe.Ingredients)
            itemIds.Add(ing.ItemId);

        var items = await _db.GameItems
            .AsNoTracking()
            .Where(i => itemIds.Contains(i.ItemId))
            .Select(i => new { i.ItemId, i.Name, i.IconPath, i.StackSize })
            .ToDictionaryAsync(i => i.ItemId);

        GameItem? Lookup(int? itemId)
        {
            if (itemId is null) return null;
            items.TryGetValue(itemId.Value, out var found);
            return found is null ? null : new GameItem
            {
                ItemId = found.ItemId,
                Name = found.Name,
                IconPath = found.IconPath,
                StackSize = found.StackSize,
            };
        }

        var craftLevels = GetCraftLevels(recipe);
        var primary = craftLevels.Length > 0 ? craftLevels[0] : (Name: "Unknown", Level: 0);
        var subCrafts = craftLevels.Skip(1)
            .Select(c => new { craft = c.Item1, level = c.Item2 })
            .ToArray();

        var crystal = Lookup(recipe.CrystalItemId);
        var hqCrystal = Lookup(recipe.HqCrystalItemId);
        var result = Lookup(recipe.ResultItemId);
        var resultHq1 = Lookup(recipe.ResultHq1ItemId);
        var resultHq2 = Lookup(recipe.ResultHq2ItemId);
        var resultHq3 = Lookup(recipe.ResultHq3ItemId);

        var ingredients = recipe.Ingredients.Select(ing =>
        {
            items.TryGetValue(ing.ItemId, out var ingItem);
            return new
            {
                itemId = ing.ItemId,
                name = ingItem?.Name,
                iconPath = ingItem?.IconPath,
                quantity = ing.Quantity,
                stackSize = ingItem?.StackSize,
            };
        }).ToArray();

        return Ok(new
        {
            id = recipe.Id,
            primaryCraft = primary.Name,
            primaryCraftLevel = primary.Level,
            subCrafts,
            crystal = crystal is null ? null : new { itemId = crystal.ItemId, name = crystal.Name, iconPath = crystal.IconPath, quantity = 1 },
            hqCrystal = hqCrystal is null ? null : new { itemId = hqCrystal.ItemId, name = hqCrystal.Name, iconPath = hqCrystal.IconPath, quantity = 1 },
            ingredients,
            result = result is null ? null : new { itemId = result.ItemId, name = result.Name, iconPath = result.IconPath, quantity = recipe.ResultQty },
            resultHq1 = resultHq1 is null ? null : new { itemId = resultHq1.ItemId, name = resultHq1.Name, iconPath = resultHq1.IconPath, quantity = recipe.ResultHq1Qty },
            resultHq2 = resultHq2 is null ? null : new { itemId = resultHq2.ItemId, name = resultHq2.Name, iconPath = resultHq2.IconPath, quantity = recipe.ResultHq2Qty },
            resultHq3 = resultHq3 is null ? null : new { itemId = resultHq3.ItemId, name = resultHq3.Name, iconPath = resultHq3.IconPath, quantity = recipe.ResultHq3Qty },
            isDesynth = recipe.IsDesynth,
            contentTag = recipe.ContentTag,
            skillRequirements = new
            {
                wood = recipe.Wood,
                smith = recipe.Smith,
                gold = recipe.Gold,
                cloth = recipe.Cloth,
                leather = recipe.Leather,
                bone = recipe.Bone,
                alchemy = recipe.Alchemy,
                cook = recipe.Cook,
            },
        });
    }

    // -------------------------------------------------------------------------
    // GET /api/recipes/by-item/{itemId}
    // -------------------------------------------------------------------------
    [HttpGet("by-item/{itemId:int}")]
    public async Task<IActionResult> ByItem(int itemId)
    {
        // Recipes where item is a result (NQ or any HQ tier)
        var craftedFromRecipes = await _db.SynthRecipes
            .AsNoTracking()
            .Where(r =>
                r.ResultItemId == itemId ||
                r.ResultHq1ItemId == itemId ||
                r.ResultHq2ItemId == itemId ||
                r.ResultHq3ItemId == itemId)
            .ToListAsync();

        // Recipes where item is used as an ingredient
        var ingredientRecipeIds = await _db.RecipeIngredients
            .AsNoTracking()
            .Where(ing => ing.ItemId == itemId)
            .Select(ing => new { ing.RecipeId, ing.Quantity })
            .ToListAsync();

        var ingredientLookup = ingredientRecipeIds.ToDictionary(x => x.RecipeId, x => x.Quantity);

        var usedInRecipes = await _db.SynthRecipes
            .AsNoTracking()
            .Where(r => ingredientLookup.Keys.Contains(r.Id))
            .ToListAsync();

        // Resolve result item names for all recipes
        var allRecipeIds = craftedFromRecipes.Select(r => r.ResultItemId)
            .Concat(usedInRecipes.Select(r => r.ResultItemId))
            .Distinct()
            .ToList();

        var resultItemNames = await _db.GameItems
            .AsNoTracking()
            .Where(i => allRecipeIds.Contains(i.ItemId))
            .Select(i => new { i.ItemId, i.Name })
            .ToDictionaryAsync(i => i.ItemId, i => i.Name);

        var craftedFrom = craftedFromRecipes.Select(r =>
        {
            var crafts = GetCraftLevels(r);
            var primary = crafts.Length > 0 ? crafts[0] : (Name: "Unknown", Level: 0);
            resultItemNames.TryGetValue(r.ResultItemId, out var resultName);

            bool isHqResult = r.ResultItemId != itemId; // itemId was found in one of the HQ columns

            return new
            {
                id = r.Id,
                resultItemName = resultName,
                primaryCraft = primary.Name,
                primaryCraftLevel = primary.Level,
                resultQty = r.ResultQty,
                isHqResult,
            };
        }).ToArray();

        var usedIn = usedInRecipes.Select(r =>
        {
            var crafts = GetCraftLevels(r);
            var primary = crafts.Length > 0 ? crafts[0] : (Name: "Unknown", Level: 0);
            resultItemNames.TryGetValue(r.ResultItemId, out var resultName);
            ingredientLookup.TryGetValue(r.Id, out var qty);

            return new
            {
                id = r.Id,
                resultItemName = resultName,
                primaryCraft = primary.Name,
                primaryCraftLevel = primary.Level,
                quantity = qty,
            };
        }).ToArray();

        return Ok(new { craftedFrom, usedIn });
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static readonly string[] CraftNames =
        ["Woodworking", "Smithing", "Goldsmithing", "Clothcraft", "Leathercraft", "Bonecraft", "Alchemy", "Cooking"];

    private static (string Name, int Level)[] GetCraftLevels(SynthRecipe r)
    {
        int[] levels = [r.Wood, r.Smith, r.Gold, r.Cloth, r.Leather, r.Bone, r.Alchemy, r.Cook];
        var result = new List<(string Name, int Level)>();
        for (int i = 0; i < 8; i++)
            if (levels[i] > 0) result.Add((CraftNames[i], levels[i]));
        return result.OrderByDescending(c => c.Level).ToArray();
    }

    /// <summary>
    /// Builds the list-view response objects for a page of recipes.
    /// Resolves result item names/icons and crystal names/icons in bulk.
    /// </summary>
    private async Task<object[]> BuildListResponse(IReadOnlyList<SynthRecipe> recipes, bool includeIngredients = false)
    {
        var resultIds = recipes.Select(r => r.ResultItemId).Distinct().ToList();
        var crystalIds = recipes.Select(r => r.CrystalItemId).Distinct().ToList();
        var allIds = resultIds.Union(crystalIds).ToList();

        var itemMap = await _db.GameItems
            .AsNoTracking()
            .Where(i => allIds.Contains(i.ItemId))
            .Select(i => new { i.ItemId, i.Name, i.IconPath })
            .ToDictionaryAsync(i => i.ItemId);

        var ingredientCounts = await _db.RecipeIngredients
            .AsNoTracking()
            .Where(ing => recipes.Select(r => r.Id).Contains(ing.RecipeId))
            .GroupBy(ing => ing.RecipeId)
            .Select(g => new { RecipeId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RecipeId, x => x.Count);

        // Optionally load full ingredient details (for leveling guide cost estimates)
        Dictionary<int, object[]>? ingredientDetails = null;
        if (includeIngredients)
        {
            var recipeIds = recipes.Select(r => r.Id).ToList();
            var ingredients = await _db.RecipeIngredients
                .AsNoTracking()
                .Where(ri => recipeIds.Contains(ri.RecipeId))
                .Join(_db.GameItems, ri => ri.ItemId, gi => gi.ItemId, (ri, gi) => new
                {
                    ri.RecipeId,
                    ri.ItemId,
                    Name = gi.Name ?? "Unknown",
                    ri.Quantity,
                    gi.BaseSell,
                })
                .ToListAsync();

            ingredientDetails = ingredients
                .GroupBy(i => i.RecipeId)
                .ToDictionary(g => g.Key, g => g.Select(i => (object)new
                {
                    itemId = i.ItemId,
                    name = i.Name,
                    quantity = i.Quantity,
                    baseSell = i.BaseSell,
                }).ToArray());
        }

        return recipes.Select(r =>
        {
            var crafts = GetCraftLevels(r);
            var primary = crafts.Length > 0 ? crafts[0] : (Name: "Unknown", Level: 0);
            var subCrafts = crafts.Skip(1).Select(c => new { craft = c.Item1, level = c.Item2 }).ToArray();

            itemMap.TryGetValue(r.ResultItemId, out var resultItem);
            itemMap.TryGetValue(r.CrystalItemId, out var crystalItem);
            ingredientCounts.TryGetValue(r.Id, out var ingCount);

            return (object)new
            {
                id = r.Id,
                resultItemId = r.ResultItemId,
                resultItemName = resultItem?.Name,
                resultItemIcon = resultItem?.IconPath,
                resultQty = r.ResultQty,
                primaryCraft = primary.Name,
                primaryCraftLevel = primary.Level,
                subCrafts,
                crystalItemId = r.CrystalItemId,
                crystalName = crystalItem?.Name,
                crystalIcon = crystalItem?.IconPath,
                ingredientCount = ingCount,
                isDesynth = r.IsDesynth,
                ingredients = ingredientDetails?.GetValueOrDefault(r.Id),
            };
        }).ToArray();
    }
}
