using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class SynthRecipeConfiguration : IEntityTypeConfiguration<SynthRecipe>
{
    public void Configure(EntityTypeBuilder<SynthRecipe> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).ValueGeneratedNever();

        builder.HasIndex(r => r.ResultItemId);
        builder.HasIndex(r => r.IsDesynth);
        builder.HasIndex(r => r.ContentTag);

        builder.Property(r => r.ContentTag).HasMaxLength(64);

        builder.Ignore(r => r.PrimaryCraft);
        builder.Ignore(r => r.PrimaryCraftLevel);
    }
}
