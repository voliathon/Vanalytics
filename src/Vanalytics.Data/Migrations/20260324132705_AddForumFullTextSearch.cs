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
            // Full-text DDL (CREATE FULLTEXT CATALOG/INDEX) cannot run inside a
            // transaction, so suppressTransaction is required. The FTS component may
            // not be installed in all environments (e.g. Testcontainers). The search
            // service falls back to LIKE queries when FTS is unavailable.
            migrationBuilder.Sql(@"
                IF (SELECT FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')) = 1
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = 'ForumFullTextCatalog')
                        EXEC('CREATE FULLTEXT CATALOG ForumFullTextCatalog AS DEFAULT');
                    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumThread'))
                        EXEC('CREATE FULLTEXT INDEX ON ForumThread(Title) KEY INDEX PK_ForumThread WITH STOPLIST = SYSTEM');
                    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumPost'))
                        EXEC('CREATE FULLTEXT INDEX ON ForumPost(Body) KEY INDEX PK_ForumPost WITH STOPLIST = SYSTEM');
                END", suppressTransaction: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                IF (SELECT FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')) = 1
                BEGIN
                    IF EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumPost'))
                        EXEC('DROP FULLTEXT INDEX ON ForumPost');
                    IF EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID('ForumThread'))
                        EXEC('DROP FULLTEXT INDEX ON ForumThread');
                    IF EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = 'ForumFullTextCatalog')
                        EXEC('DROP FULLTEXT CATALOG ForumFullTextCatalog');
                END", suppressTransaction: true);
        }
    }
}
