use crate::error::{AppError, Result};
use crate::services::github_auth::GithubAuthService;
use git2::{
    Cred, DiffFormat, DiffOptions, FetchOptions, IndexAddOption, MergeOptions, PushOptions,
    RemoteCallbacks, Repository, Signature, StatusOptions, build::RepoBuilder,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub staged: bool,
    pub status: String, // "modified" | "added" | "deleted" | "renamed" | "untracked"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoStatus {
    pub is_repo: bool,
    pub branch: String,
    pub is_clean: bool,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub success: bool,
    pub up_to_date: bool,
    pub fast_forward: bool,
    pub message: String,
    pub new_head: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileResult {
    pub clean: bool,
    pub merged_text: String,
    pub has_conflicts: bool,
    pub conflict_count: usize,
}

pub struct GitEngine;

impl GitEngine {
    /// Checks whether the exact folder is an initialized Git repository
    pub fn is_repo(path: &Path) -> bool {
        Repository::open(path).is_ok()
    }

    /// Open an existing Git repository
    pub fn open(path: &Path) -> Result<Repository> {
        Repository::discover(path)
            .map_err(|e| AppError::Git(format!("Failed to open git repository: {e}")))
    }

    /// Sets or updates a remote URL on the repository (initializing if needed)
    pub fn set_remote(path: &Path, remote_name: Option<&str>, url: &str) -> Result<()> {
        let repo = if Self::is_repo(path) {
            Self::open(path)?
        } else {
            Self::init(path)?
        };
        let r_name = remote_name.unwrap_or("origin");
        if repo.find_remote(r_name).is_ok() {
            repo.remote_set_url(r_name, url)
                .map_err(|e| AppError::Git(format!("Failed to set remote url: {e}")))?;
        } else {
            repo.remote(r_name, url)
                .map_err(|e| AppError::Git(format!("Failed to add remote: {e}")))?;
        }
        Ok(())
    }

    /// Initialize a new Git repository with main branch
    pub fn init(path: &Path) -> Result<Repository> {
        let repo = Repository::init(path)
            .map_err(|e| AppError::Git(format!("Failed to init git repository: {e}")))?;
        // Set default branch name to main if possible
        let _ = repo.set_head("refs/heads/main");
        Ok(repo)
    }

    /// Configure authenticated RemoteCallbacks using keyring OAuth token
    fn make_callbacks() -> RemoteCallbacks<'static> {
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, _username_from_url, _allowed_types| {
            if let Ok(Some(token)) = GithubAuthService::get_token() {
                Cred::userpass_plaintext("x-access-token", &token)
            } else {
                Cred::default()
            }
        });
        callbacks
    }

    /// Clone a remote repository to target directory with OAuth credentials
    pub fn clone_repo(url: &str, target_path: &Path, branch: Option<&str>) -> Result<()> {
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(Self::make_callbacks());

        let mut builder = RepoBuilder::new();
        builder.fetch_options(fo);
        if let Some(b) = branch {
            builder.branch(b);
        }

        builder
            .clone(url, target_path)
            .map_err(|e| AppError::Git(format!("Clone failed: {e}")))?;
        Ok(())
    }

    /// Get current working tree and index status
    pub fn get_status(path: &Path) -> Result<GitRepoStatus> {
        if !Self::is_repo(path) {
            return Ok(GitRepoStatus {
                is_repo: false,
                branch: "main".into(),
                is_clean: true,
                ahead: 0,
                behind: 0,
                staged: vec![],
                unstaged: vec![],
            });
        }

        let repo = Self::open(path)?;

        let branch = match repo.head() {
            Ok(head) => head
                .shorthand()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "HEAD (detached)".to_string()),
            Err(_) => "main (unborn)".to_string(),
        };

        let mut ahead = 0;
        let mut behind = 0;
        if let Some((a, b)) = (|| -> Option<(usize, usize)> {
            let head_ref = repo.head().ok()?;
            let branch_name = head_ref.shorthand()?;
            let local_branch = repo
                .find_branch(branch_name, git2::BranchType::Local)
                .ok()?;
            let upstream = local_branch.upstream().ok()?;
            let local_oid = local_branch.get().target()?;
            let upstream_oid = upstream.get().target()?;
            repo.graph_ahead_behind(local_oid, upstream_oid).ok()
        })() {
            ahead = a;
            behind = b;
        }

        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .renames_head_to_index(true)
            .renames_index_to_workdir(true);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to retrieve git status: {e}")))?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();

        for entry in statuses.iter() {
            let file_path = entry.path().unwrap_or("").replace('\\', "/");
            let s = entry.status();

            // Index / Staged changes
            if s.contains(git2::Status::INDEX_NEW) {
                staged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: true,
                    status: "added".into(),
                });
            } else if s.contains(git2::Status::INDEX_MODIFIED) {
                staged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: true,
                    status: "modified".into(),
                });
            } else if s.contains(git2::Status::INDEX_DELETED) {
                staged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: true,
                    status: "deleted".into(),
                });
            } else if s.contains(git2::Status::INDEX_RENAMED) {
                staged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: true,
                    status: "renamed".into(),
                });
            }

            // Working Tree / Unstaged changes
            if s.contains(git2::Status::WT_NEW) {
                unstaged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: false,
                    status: "untracked".into(),
                });
            } else if s.contains(git2::Status::WT_MODIFIED) {
                unstaged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: false,
                    status: "modified".into(),
                });
            } else if s.contains(git2::Status::WT_DELETED) {
                unstaged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: false,
                    status: "deleted".into(),
                });
            } else if s.contains(git2::Status::WT_RENAMED) {
                unstaged.push(GitFileStatus {
                    path: file_path.clone(),
                    staged: false,
                    status: "renamed".into(),
                });
            }
        }

        let is_clean = staged.is_empty() && unstaged.is_empty();

        Ok(GitRepoStatus {
            is_repo: true,
            branch,
            is_clean,
            ahead,
            behind,
            staged,
            unstaged,
        })
    }

    /// Stage a single file
    pub fn stage_file(path: &Path, file_path: &str) -> Result<()> {
        let repo = Self::open(path)?;
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to open index: {e}")))?;
        index
            .add_path(Path::new(file_path))
            .map_err(|e| AppError::Git(format!("Failed to stage {file_path}: {e}")))?;
        index
            .write()
            .map_err(|e| AppError::Git(format!("Failed to write index: {e}")))?;
        Ok(())
    }

    /// Unstage a single file
    pub fn unstage_file(path: &Path, file_path: &str) -> Result<()> {
        let repo = Self::open(path)?;
        let head = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let obj = head.as_ref().map(|c| c.as_object());
        repo.reset_default(obj, [file_path])
            .map_err(|e| AppError::Git(format!("Failed to unstage {file_path}: {e}")))?;
        Ok(())
    }

    /// Stage all modified and untracked files
    pub fn stage_all(path: &Path) -> Result<()> {
        let repo = Self::open(path)?;
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to open index: {e}")))?;
        index
            .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
            .map_err(|e| AppError::Git(format!("Failed to stage all: {e}")))?;
        index
            .write()
            .map_err(|e| AppError::Git(format!("Failed to write index: {e}")))?;
        Ok(())
    }

    /// Unstage all staged files
    pub fn unstage_all(path: &Path) -> Result<()> {
        let repo = Self::open(path)?;
        let head = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let obj = head.as_ref().map(|c| c.as_object());
        repo.reset_default(obj, ["*"])
            .map_err(|e| AppError::Git(format!("Failed to unstage all: {e}")))?;
        Ok(())
    }

    /// Commit staged changes
    pub fn commit(
        path: &Path,
        message: &str,
        author_name: Option<&str>,
        author_email: Option<&str>,
    ) -> Result<String> {
        let repo = Self::open(path)?;
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to open index: {e}")))?;
        let tree_oid = index
            .write_tree()
            .map_err(|e| AppError::Git(format!("Failed to write tree: {e}")))?;
        let tree = repo
            .find_tree(tree_oid)
            .map_err(|e| AppError::Git(format!("Failed to find tree: {e}")))?;

        let name = author_name.unwrap_or("LeafForge User");
        let email = author_email.unwrap_or("user@leafforge.local");
        let sig = Signature::now(name, email)
            .map_err(|e| AppError::Git(format!("Failed to create signature: {e}")))?;

        let parent_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = match parent_commit.as_ref() {
            Some(c) => vec![c],
            None => vec![],
        };

        let commit_oid = repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .map_err(|e| AppError::Git(format!("Commit failed: {e}")))?;

        Ok(commit_oid.to_string())
    }

    /// Get unified diff for a file or the whole working tree/index
    pub fn get_diff(path: &Path, file_path: Option<&str>, staged: bool) -> Result<String> {
        let repo = Self::open(path)?;
        let mut diff_opts = DiffOptions::new();
        if let Some(fp) = file_path {
            diff_opts.pathspec(fp);
        }

        let diff = if staged {
            let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            repo.diff_tree_to_index(
                head_tree.as_ref(),
                Some(&repo.index().map_err(|e| AppError::Git(e.to_string()))?),
                Some(&mut diff_opts),
            )
            .map_err(|e| AppError::Git(format!("Staged diff failed: {e}")))?
        } else {
            repo.diff_index_to_workdir(None, Some(&mut diff_opts))
                .map_err(|e| AppError::Git(format!("Working tree diff failed: {e}")))?
        };

        let mut diff_output = String::new();
        diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(content) = std::str::from_utf8(line.content()) {
                let prefix = match line.origin() {
                    '+' => "+",
                    '-' => "-",
                    ' ' => " ",
                    'F' | 'H' => "",
                    _ => "",
                };
                diff_output.push_str(prefix);
                diff_output.push_str(content);
            }
            true
        })
        .map_err(|e| AppError::Git(format!("Failed to format diff: {e}")))?;

        Ok(diff_output)
    }

    /// Push current branch to remote
    pub fn push(path: &Path, remote_name: Option<&str>, branch: Option<&str>) -> Result<()> {
        let repo = Self::open(path)?;
        let r_name = remote_name.unwrap_or("origin");

        let current_branch = match branch {
            Some(b) => b.to_string(),
            None => repo
                .head()
                .map_err(|e| AppError::Git(format!("No HEAD reference: {e}")))?
                .shorthand()
                .unwrap_or("main")
                .to_string(),
        };

        let mut remote = repo
            .find_remote(r_name)
            .map_err(|e| AppError::Git(format!("Remote '{r_name}' not found: {e}")))?;

        let mut po = PushOptions::new();
        po.remote_callbacks(Self::make_callbacks());

        let refspec = format!("refs/heads/{current_branch}:refs/heads/{current_branch}");
        remote
            .push(&[&refspec], Some(&mut po))
            .map_err(|e| AppError::Git(format!("Push to {r_name}/{current_branch} failed: {e}")))?;

        Ok(())
    }

    /// Pull changes from remote (fetch + fast-forward or merge)
    pub fn pull(
        path: &Path,
        remote_name: Option<&str>,
        branch: Option<&str>,
    ) -> Result<PullResult> {
        let repo = Self::open(path)?;
        let r_name = remote_name.unwrap_or("origin");

        let current_branch = match branch {
            Some(b) => b.to_string(),
            None => repo
                .head()
                .map_err(|e| AppError::Git(format!("No HEAD reference: {e}")))?
                .shorthand()
                .unwrap_or("main")
                .to_string(),
        };

        let mut remote = repo
            .find_remote(r_name)
            .map_err(|e| AppError::Git(format!("Remote '{r_name}' not found: {e}")))?;

        let mut fo = FetchOptions::new();
        fo.remote_callbacks(Self::make_callbacks());

        remote
            .fetch(&[&current_branch], Some(&mut fo), None)
            .map_err(|e| AppError::Git(format!("Fetch failed: {e}")))?;

        let fetch_head = repo
            .find_reference("FETCH_HEAD")
            .map_err(|e| AppError::Git(format!("Failed to find FETCH_HEAD: {e}")))?;
        let fetch_commit = repo
            .reference_to_annotated_commit(&fetch_head)
            .map_err(|e| AppError::Git(format!("Annotated commit failed: {e}")))?;

        let analysis = repo
            .merge_analysis(&[&fetch_commit])
            .map_err(|e| AppError::Git(format!("Merge analysis failed: {e}")))?;

        if analysis.0.is_up_to_date() {
            return Ok(PullResult {
                success: true,
                up_to_date: true,
                fast_forward: false,
                message: "Already up to date.".into(),
                new_head: None,
            });
        }

        if analysis.0.is_fast_forward() {
            let refname = format!("refs/heads/{current_branch}");
            let mut reference = repo
                .find_reference(&refname)
                .map_err(|e| AppError::Git(format!("Failed to find {refname}: {e}")))?;
            reference
                .set_target(
                    fetch_commit.id(),
                    &format!("Fast-Forward: {current_branch}"),
                )
                .map_err(|e| AppError::Git(format!("Fast-forward set_target failed: {e}")))?;
            repo.set_head(&refname)
                .map_err(|e| AppError::Git(format!("Set head failed: {e}")))?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(|e| AppError::Git(format!("Checkout failed: {e}")))?;

            return Ok(PullResult {
                success: true,
                up_to_date: false,
                fast_forward: true,
                message: format!("Fast-forwarded to {}", fetch_commit.id()),
                new_head: Some(fetch_commit.id().to_string()),
            });
        }

        // Normal merge
        let mut merge_opts = MergeOptions::new();
        repo.merge(&[&fetch_commit], Some(&mut merge_opts), None)
            .map_err(|e| AppError::Git(format!("Merge failed: {e}")))?;

        let mut index = repo.index().map_err(|e| AppError::Git(e.to_string()))?;
        if index.has_conflicts() {
            return Ok(PullResult {
                success: false,
                up_to_date: false,
                fast_forward: false,
                message: "Merge resulted in conflicts. Resolve them in the conflict manager."
                    .into(),
                new_head: None,
            });
        }

        let tree_id = index
            .write_tree()
            .map_err(|e| AppError::Git(e.to_string()))?;
        let tree = repo
            .find_tree(tree_id)
            .map_err(|e| AppError::Git(e.to_string()))?;
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        let remote_commit = repo.find_commit(fetch_commit.id()).unwrap();

        let sig = Signature::now("LeafForge User", "user@leafforge.local")
            .map_err(|e| AppError::Git(e.to_string()))?;
        let commit_oid = repo
            .commit(
                Some("HEAD"),
                &sig,
                &sig,
                &format!("Merge branch '{current_branch}' of {r_name}"),
                &tree,
                &[&head_commit, &remote_commit],
            )
            .map_err(|e| AppError::Git(format!("Merge commit failed: {e}")))?;

        repo.cleanup_state()
            .map_err(|e| AppError::Git(e.to_string()))?;

        Ok(PullResult {
            success: true,
            up_to_date: false,
            fast_forward: false,
            message: format!("Merged successfully: {commit_oid}"),
            new_head: Some(commit_oid.to_string()),
        })
    }

    /// List all local branches
    pub fn list_branches(path: &Path) -> Result<Vec<String>> {
        let repo = Self::open(path)?;
        let branches = repo
            .branches(Some(git2::BranchType::Local))
            .map_err(|e| AppError::Git(format!("Failed to list branches: {e}")))?;

        let mut names = Vec::new();
        for b in branches {
            let (branch, _) = b.map_err(|e| AppError::Git(e.to_string()))?;
            if let Ok(Some(name)) = branch.name() {
                names.push(name.to_string());
            }
        }
        Ok(names)
    }

    /// Switch or create a local branch
    pub fn checkout_branch(path: &Path, branch_name: &str, create: bool) -> Result<()> {
        let repo = Self::open(path)?;

        if create {
            let head_commit = repo
                .head()
                .map_err(|e| AppError::Git(e.to_string()))?
                .peel_to_commit()
                .map_err(|e| AppError::Git(e.to_string()))?;
            repo.branch(branch_name, &head_commit, false)
                .map_err(|e| AppError::Git(format!("Create branch failed: {e}")))?;
        }

        let refname = format!("refs/heads/{branch_name}");
        repo.set_head(&refname)
            .map_err(|e| AppError::Git(format!("Set head to {refname} failed: {e}")))?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().safe()))
            .map_err(|e| AppError::Git(format!("Checkout failed: {e}")))?;

        Ok(())
    }

    /// Get remote URL for origin or specified remote
    pub fn get_remote_url(path: &Path, remote_name: Option<&str>) -> Result<Option<String>> {
        let repo = match Self::open(path) {
            Ok(r) => r,
            Err(_) => return Ok(None),
        };
        let r_name = remote_name.unwrap_or("origin");
        match repo.find_remote(r_name) {
            Ok(remote) => Ok(remote.url().map(String::from)),
            Err(_) => Ok(None),
        }
    }

    /// 3-Way CRDT-to-Git Reconciliation Algorithm (Subsystem B.3)
    /// Merges (S_base, S_crdt, S_remote)
    pub fn reconcile_3way(base: &str, crdt: &str, remote: &str) -> Result<ReconcileResult> {
        // Fast path 1: CRDT equals remote -> trivially clean
        if crdt == remote {
            return Ok(ReconcileResult {
                clean: true,
                merged_text: crdt.to_string(),
                has_conflicts: false,
                conflict_count: 0,
            });
        }

        // Fast path 2: Remote didn't change from base -> CRDT wins
        if remote == base {
            return Ok(ReconcileResult {
                clean: true,
                merged_text: crdt.to_string(),
                has_conflicts: false,
                conflict_count: 0,
            });
        }

        // Fast path 3: CRDT didn't change from base -> Remote wins
        if crdt == base {
            return Ok(ReconcileResult {
                clean: true,
                merged_text: remote.to_string(),
                has_conflicts: false,
                conflict_count: 0,
            });
        }

        // Line-based 3-way diff reconciliation
        let base_lines: Vec<&str> = base.lines().collect();
        let crdt_lines: Vec<&str> = crdt.lines().collect();
        let remote_lines: Vec<&str> = remote.lines().collect();

        let mut merged = Vec::new();
        let mut conflicts = 0;
        let mut idx_base = 0;
        let mut idx_crdt = 0;
        let mut idx_remote = 0;

        while idx_base < base_lines.len()
            || idx_crdt < crdt_lines.len()
            || idx_remote < remote_lines.len()
        {
            let b = base_lines.get(idx_base).copied();
            let c = crdt_lines.get(idx_crdt).copied();
            let r = remote_lines.get(idx_remote).copied();

            if c == r {
                if let Some(line) = c {
                    merged.push(line.to_string());
                }
                idx_base += 1;
                idx_crdt += 1;
                idx_remote += 1;
            } else if c == b && r != b {
                // Remote modified, CRDT untouched on this line
                if let Some(line) = r {
                    merged.push(line.to_string());
                }
                idx_base += 1;
                idx_crdt += 1;
                idx_remote += 1;
            } else if r == b && c != b {
                // CRDT modified, Remote untouched on this line
                if let Some(line) = c {
                    merged.push(line.to_string());
                }
                idx_base += 1;
                idx_crdt += 1;
                idx_remote += 1;
            } else {
                // Both modified differently -> conflict
                conflicts += 1;
                merged.push("<<<<<<< LIVE SESSION (CRDT)".to_string());
                if let Some(line) = c {
                    merged.push(line.to_string());
                }
                merged.push("=======".to_string());
                if let Some(line) = r {
                    merged.push(line.to_string());
                }
                merged.push(">>>>>>> INCOMING GIT COMMIT".to_string());

                idx_base += 1;
                idx_crdt += 1;
                idx_remote += 1;
            }
        }

        let merged_text = merged.join("\n");
        let has_conflicts = conflicts > 0;

        Ok(ReconcileResult {
            clean: !has_conflicts,
            merged_text,
            has_conflicts,
            conflict_count: conflicts,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_git_init_and_status() {
        let dir = tempdir().unwrap();
        let path = dir.path();

        GitEngine::init(path).expect("git init");
        let status = GitEngine::get_status(path).expect("git status");
        assert!(status.is_clean);

        // Create a test file
        let file_path = path.join("main.tex");
        std::fs::write(
            &file_path,
            "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
        )
        .unwrap();

        let status2 = GitEngine::get_status(path).expect("git status 2");
        assert!(!status2.is_clean);
        assert_eq!(status2.unstaged.len(), 1);
        assert_eq!(status2.unstaged[0].path, "main.tex");
        assert_eq!(status2.unstaged[0].status, "untracked");

        // Stage file
        GitEngine::stage_file(path, "main.tex").expect("stage file");
        let status3 = GitEngine::get_status(path).expect("git status 3");
        assert_eq!(status3.staged.len(), 1);
        assert_eq!(status3.staged[0].path, "main.tex");
        assert_eq!(status3.staged[0].status, "added");

        // Unstage file
        GitEngine::unstage_file(path, "main.tex").expect("unstage file");
        let status4 = GitEngine::get_status(path).expect("git status 4");
        assert_eq!(status4.staged.len(), 0);
        assert_eq!(status4.unstaged.len(), 1);

        // Stage all and commit
        GitEngine::stage_all(path).expect("stage all");
        let commit_oid = GitEngine::commit(
            path,
            "Initial commit",
            Some("Tester"),
            Some("test@example.com"),
        )
        .expect("commit");
        assert!(!commit_oid.is_empty());

        let status5 = GitEngine::get_status(path).expect("git status 5");
        assert!(status5.is_clean);
    }

    #[test]
    fn test_git_diff() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        GitEngine::init(path).expect("init");

        let file_path = path.join("doc.tex");
        std::fs::write(&file_path, "Line 1\nLine 2\n").unwrap();
        GitEngine::stage_all(path).unwrap();
        GitEngine::commit(path, "Commit 1", None, None).unwrap();

        // Modify file
        std::fs::write(&file_path, "Line 1\nLine 2 modified\nLine 3\n").unwrap();
        let diff = GitEngine::get_diff(path, Some("doc.tex"), false).expect("diff");
        assert!(diff.contains("+Line 2 modified") || diff.contains("Line 2 modified"));
    }

    #[test]
    fn test_3way_reconciliation_clean() {
        let base = "Line 1\nLine 2\nLine 3";
        let crdt = "Line 1\nLine 2 edited by user\nLine 3";
        let remote = "Line 1\nLine 2\nLine 3";

        let result = GitEngine::reconcile_3way(base, crdt, remote).unwrap();
        assert!(result.clean);
        assert_eq!(result.merged_text, crdt);
    }

    #[test]
    fn test_3way_reconciliation_remote_changed() {
        let base = "Line 1\nLine 2\nLine 3";
        let crdt = "Line 1\nLine 2\nLine 3";
        let remote = "Line 1\nLine 2 remote change\nLine 3";

        let result = GitEngine::reconcile_3way(base, crdt, remote).unwrap();
        assert!(result.clean);
        assert_eq!(result.merged_text, remote);
    }

    #[test]
    fn test_3way_reconciliation_conflict() {
        let base = "Line 1\nLine 2\nLine 3";
        let crdt = "Line 1\nLine 2 by live peer\nLine 3";
        let remote = "Line 1\nLine 2 by external push\nLine 3";

        let result = GitEngine::reconcile_3way(base, crdt, remote).unwrap();
        assert!(!result.clean);
        assert!(result.has_conflicts);
        assert!(result.merged_text.contains("<<<<<<< LIVE SESSION (CRDT)"));
        assert!(result.merged_text.contains(">>>>>>> INCOMING GIT COMMIT"));
    }

    #[test]
    fn test_git_get_remote_url() {
        let tmp = std::env::temp_dir().join(format!(
            "lf_remote_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        let repo = Repository::init(&tmp).unwrap();
        assert!(GitEngine::get_remote_url(&tmp, None).unwrap().is_none());
        repo.remote("origin", "https://github.com/alice/paper.git")
            .unwrap();
        let url = GitEngine::get_remote_url(&tmp, None).unwrap();
        assert_eq!(url.as_deref(), Some("https://github.com/alice/paper.git"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_git_is_repo_and_set_remote() {
        let tmp = std::env::temp_dir().join(format!(
            "lf_is_repo_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        // Initially not a repo
        assert!(!GitEngine::is_repo(&tmp));
        let status = GitEngine::get_status(&tmp).unwrap();
        assert!(!status.is_repo);

        // set_remote should auto-init and set origin
        GitEngine::set_remote(&tmp, None, "https://github.com/bob/research.git").unwrap();
        assert!(GitEngine::is_repo(&tmp));

        let status_after = GitEngine::get_status(&tmp).unwrap();
        assert!(status_after.is_repo);

        let url = GitEngine::get_remote_url(&tmp, None).unwrap();
        assert_eq!(url.as_deref(), Some("https://github.com/bob/research.git"));

        // Update remote url
        GitEngine::set_remote(&tmp, None, "https://github.com/bob/new-url.git").unwrap();
        let updated_url = GitEngine::get_remote_url(&tmp, None).unwrap();
        assert_eq!(
            updated_url.as_deref(),
            Some("https://github.com/bob/new-url.git")
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
