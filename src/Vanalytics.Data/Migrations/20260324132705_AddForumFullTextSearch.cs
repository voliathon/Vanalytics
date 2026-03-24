using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vanalytics.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddForumFullTextSearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("CREATE FULLTEXT CATALOG ForumFullTextCatalog AS DEFAULT;");
            migrationBuilder.Sql(
                @"CREATE FULLTEXT INDEX ON ForumThreads(Title)
                  KEY INDEX PK_ForumThreads
                  WITH STOPLIST = SYSTEM;");
            migrationBuilder.Sql(
                @"CREATE FULLTEXT INDEX ON ForumPosts(Body)
                  KEY INDEX PK_ForumPosts
                  WITH STOPLIST = SYSTEM;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP FULLTEXT INDEX ON ForumPosts;");
            migrationBuilder.Sql("DROP FULLTEXT INDEX ON ForumThreads;");
            migrationBuilder.Sql("DROP FULLTEXT CATALOG ForumFullTextCatalog;");
        }
    }
}
