using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReactionsAndReplies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ReplyToPostId",
                table: "ForumPost",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ForumReaction",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PostId = table.Column<long>(type: "bigint", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReactionType = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ForumReaction", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ForumReaction_ForumPost_PostId",
                        column: x => x.PostId,
                        principalTable: "ForumPost",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Migrate existing votes to Like reactions
            migrationBuilder.Sql(@"
                INSERT INTO ForumReaction (PostId, UserId, ReactionType, CreatedAt)
                SELECT PostId, UserId, 0, CreatedAt
                FROM ForumVote
            ");

            migrationBuilder.DropTable(
                name: "ForumVote");

            migrationBuilder.CreateIndex(
                name: "IX_ForumPost_ReplyToPostId",
                table: "ForumPost",
                column: "ReplyToPostId");

            migrationBuilder.CreateIndex(
                name: "IX_ForumReaction_PostId_UserId_ReactionType",
                table: "ForumReaction",
                columns: new[] { "PostId", "UserId", "ReactionType" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ForumPost_ForumPost_ReplyToPostId",
                table: "ForumPost",
                column: "ReplyToPostId",
                principalTable: "ForumPost",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ForumPost_ForumPost_ReplyToPostId",
                table: "ForumPost");

            migrationBuilder.DropTable(
                name: "ForumReaction");

            migrationBuilder.DropIndex(
                name: "IX_ForumPost_ReplyToPostId",
                table: "ForumPost");

            migrationBuilder.DropColumn(
                name: "ReplyToPostId",
                table: "ForumPost");

            migrationBuilder.CreateTable(
                name: "ForumVote",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PostId = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ForumVote", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ForumVote_ForumPost_PostId",
                        column: x => x.PostId,
                        principalTable: "ForumPost",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ForumVote_PostId_UserId",
                table: "ForumVote",
                columns: new[] { "PostId", "UserId" },
                unique: true);
        }
    }
}
