import Database from 'better-sqlite3';

export function migration007(db: Database.Database): void {
  db.exec(`
    ALTER TABLE threads ADD COLUMN replyApprovalTrust TEXT CHECK(
      replyApprovalTrust IS NULL OR replyApprovalTrust IN ('new', 'unknown', 'trusted', 'verified')
    );
    UPDATE threads SET replyApprovalTrust = 'new' WHERE autoApproveReplies = 1;
    ALTER TABLE threads DROP COLUMN autoApproveReplies;
  `);
}
