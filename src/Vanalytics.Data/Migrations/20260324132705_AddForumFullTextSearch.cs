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
            // Full-text search requires the FTS component, which may not be
            // installed in all environments (e.g. Testcontainers).  The search
            // service falls back to LIKE queries when FTS is unavailable, so
            // it is safe to skip these statements when the component is missing.
            migrationBuilder.Sql(@"
                IF (SELECT FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')) = 1
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = 'ForumFullTextCatalog')
                        EXEC('CREATE FULLTEXT CATALOG ForumFullTextCatalog AS DEFAULT');
                    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumThreads'))
                        EXEC('CREATE FULLTEXT INDEX ON ForumThreads(Title) KEY INDEX PK_ForumThreads WITH STOPLIST = SYSTEM');
                    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumPosts'))
                        EXEC('CREATE FULLTEXT INDEX ON ForumPosts(Body) KEY INDEX PK_ForumPosts WITH STOPLIST = SYSTEM');
                END");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                IF (SELECT FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')) = 1
                BEGIN
                    IF EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumPosts'))
                        EXEC('DROP FULLTEXT INDEX ON ForumPosts');
                    IF EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumThreads'))
                        EXEC('DROP FULLTEXT INDEX ON ForumThreads');
                    IF EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = 'ForumFullTextCatalog')
                        EXEC('DROP FULLTEXT CATALOG ForumFullTextCatalog');
                END");
        }
    }
}
