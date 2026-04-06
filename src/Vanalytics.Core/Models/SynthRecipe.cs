using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Vanalytics.Core.Models;

public class SynthRecipe
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }

    public int Wood { get; set; }
    public int Smith { get; set; }
    public int Gold { get; set; }
    public int Cloth { get; set; }
    public int Leather { get; set; }
    public int Bone { get; set; }
    public int Alchemy { get; set; }
    public int Cook { get; set; }

    public int CrystalItemId { get; set; }
    public int? HqCrystalItemId { get; set; }

    public int ResultItemId { get; set; }
    public int ResultQty { get; set; }
    public int? ResultHq1ItemId { get; set; }
    public int? ResultHq1Qty { get; set; }
    public int? ResultHq2ItemId { get; set; }
    public int? ResultHq2Qty { get; set; }
    public int? ResultHq3ItemId { get; set; }
    public int? ResultHq3Qty { get; set; }

    public bool IsDesynth { get; set; }
    public string? ContentTag { get; set; }

    public ICollection<RecipeIngredient> Ingredients { get; set; } = [];

    [NotMapped]
    public string PrimaryCraft
    {
        get
        {
            var crafts = new (string Name, int Level)[]
            {
                ("Woodworking", Wood), ("Smithing", Smith), ("Goldsmithing", Gold),
                ("Clothcraft", Cloth), ("Leathercraft", Leather), ("Bonecraft", Bone),
                ("Alchemy", Alchemy), ("Cooking", Cook)
            };
            return crafts.OrderByDescending(c => c.Level).First().Name;
        }
    }

    [NotMapped]
    public int PrimaryCraftLevel => new[] { Wood, Smith, Gold, Cloth, Leather, Bone, Alchemy, Cook }.Max();
}
