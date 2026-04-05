using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class CharacterSkill
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public SkillType Skill { get; set; }
    public int Level { get; set; }
    public int Cap { get; set; }

    public Character Character { get; set; } = null!;
}
