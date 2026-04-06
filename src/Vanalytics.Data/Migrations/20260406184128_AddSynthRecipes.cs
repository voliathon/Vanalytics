using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSynthRecipes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SynthRecipes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Wood = table.Column<int>(type: "int", nullable: false),
                    Smith = table.Column<int>(type: "int", nullable: false),
                    Gold = table.Column<int>(type: "int", nullable: false),
                    Cloth = table.Column<int>(type: "int", nullable: false),
                    Leather = table.Column<int>(type: "int", nullable: false),
                    Bone = table.Column<int>(type: "int", nullable: false),
                    Alchemy = table.Column<int>(type: "int", nullable: false),
                    Cook = table.Column<int>(type: "int", nullable: false),
                    CrystalItemId = table.Column<int>(type: "int", nullable: false),
                    HqCrystalItemId = table.Column<int>(type: "int", nullable: true),
                    ResultItemId = table.Column<int>(type: "int", nullable: false),
                    ResultQty = table.Column<int>(type: "int", nullable: false),
                    ResultHq1ItemId = table.Column<int>(type: "int", nullable: true),
                    ResultHq1Qty = table.Column<int>(type: "int", nullable: true),
                    ResultHq2ItemId = table.Column<int>(type: "int", nullable: true),
                    ResultHq2Qty = table.Column<int>(type: "int", nullable: true),
                    ResultHq3ItemId = table.Column<int>(type: "int", nullable: true),
                    ResultHq3Qty = table.Column<int>(type: "int", nullable: true),
                    IsDesynth = table.Column<bool>(type: "bit", nullable: false),
                    ContentTag = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SynthRecipes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RecipeIngredients",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RecipeId = table.Column<int>(type: "int", nullable: false),
                    ItemId = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecipeIngredients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RecipeIngredients_SynthRecipes_RecipeId",
                        column: x => x.RecipeId,
                        principalTable: "SynthRecipes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RecipeIngredients_RecipeId_ItemId",
                table: "RecipeIngredients",
                columns: new[] { "RecipeId", "ItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SynthRecipes_ContentTag",
                table: "SynthRecipes",
                column: "ContentTag");

            migrationBuilder.CreateIndex(
                name: "IX_SynthRecipes_IsDesynth",
                table: "SynthRecipes",
                column: "IsDesynth");

            migrationBuilder.CreateIndex(
                name: "IX_SynthRecipes_ResultItemId",
                table: "SynthRecipes",
                column: "ResultItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RecipeIngredients");

            migrationBuilder.DropTable(
                name: "SynthRecipes");
        }
    }
}
