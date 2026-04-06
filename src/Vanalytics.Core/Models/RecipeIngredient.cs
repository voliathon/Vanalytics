using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.Models;

public class RecipeIngredient
{
    [Key]
    public int Id { get; set; }

    public int RecipeId { get; set; }
    public int ItemId { get; set; }
    public int Quantity { get; set; }
}
