<div align="center">

# Repo File Sync Action

[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/Redocly/repo-file-sync-action/blob/main/LICENSE)

Keep Action workflows or entire directories synchronized across multiple repositories.

</div>

With the `repo-file-sync-action`, you can synchronize files such as workflow `.yml` files, configuration files, or entire directories between repositories or branches. This is accomplished by triggering a GitHub Action in your main repository whenever you push changes. The action utilizes a `sync.yml` configuration file to determine which files need to be synchronized to where. If a file is detected to be out of sync, the action will create a pull request in the target repository with the necessary updates.

## Usage

Create a `.yml` file in your `.github/workflows` folder (you can find more info about the structure in the [GitHub Docs](https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions)):

### .github/workflows/sync.yml

```yml
name: Sync Files
on:
  push:
    branches:
      - master
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@master
      - name: Run GitHub File Sync
        uses: hirotomoyamada/repo-file-sync-action@main
        with:
          GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
```

In order for the Action to access your repositories you have to specify a [Personal Access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) as the value for `GITHUB_TOKEN`.

> [!NOTE]
>
> `secrets.GITHUB_TOKEN` will not work

It is recommended to set the token as a
[Repository Secret](https://docs.github.com/en/free-pro-team@latest/actions/reference/encrypted-secrets#creating-encrypted-secrets-for-a-repository).

The last step is to create a `.yml` file in the `.github` folder of your repository and specify what file(s) to sync to which repositories:

### .github/sync.yml

```yml
user/target-repository:
  - source: this-is-source/
    dest: this-is-target/
```

More info on how to specify what files to sync where [below](#sync-configuration).

## Action Inputs

| Key                     | Value                                                                                   | Required | Default                               |
| ----------------------- | --------------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| `GH_PAT`                | Your [Personal Access token].                                                           | **Yes**  | N/A                                   |
| `CONFIG_PATH`           | Path to the sync configuration file.                                                    | **No**   | .github/sync.yml                      |
| `PR_LABELS`             | Labels which will be added to the pull request. Set to false to turn off.               | **No**   | sync                                  |
| `ASSIGNEES`             | People to assign to the pull request.                                                   | **No**   | N/A                                   |
| `PR_TITLE`              | pull request title.                                                                     | **No**   | Synced file(s) with GITHUB_REPOSITORY |
| `COMMIT_BODY`           | Commit message body. Will be appended to commit message, separated by two line returns. | **No**   | ''                                    |
| `COMMIT_EACH_FILE`      | Commit each file separately.                                                            | **No**   | true                                  |
| `GIT_EMAIL`             | The e-mail address used to commit the synced files.                                     | **No**   | the email of the PAT used             |
| `GIT_USERNAME`          | The username used to commit the synced files.                                           | **No**   | the username of the PAT used          |
| `OVERWRITE_EXISTING_PR` | Overwrite any existing Sync PR with the new changes.                                    | **No**   | true                                  |
| `BRANCH_PREFIX`         | Specify a different prefix for the new branch in the target repo.                       | **No**   | repo-sync/SOURCE_REPO_NAME            |
| `TMP_DIR`               | The working directory where all git operations will be done.                            | **No**   | tmp-${ Date.now().toString() }        |
| `DRY_RUN`               | Run everything except that nothing will be pushed.                                      | **No**   | false                                 |
| `SKIP_CLEANUP`          | Skips removing the temporary directory. Useful for debugging.                           | **No**   | false                                 |
| `SKIP_PR`               | Skips creating a Pull Request and pushes directly to the default branch.                | **No**   | false                                 |
| `TARGET_BRANCH`         | Valid when SKIP_PR is true. A new branch of the target repo..                           | **No**   | N/A                                   |

## Sync Configuration

In order to tell [repo-file-sync-action](https://github.com/Redocly/repo-file-sync-action) what files to sync where, you have to create a `sync.yml` file in the `.github` directory of your main repository (see [action-inputs](#action-inputs) on how to change the location).

The top-level key should be used to specify the target repository in the format `username`/`repository-name`@`branch`, after that you can list all the files you want to sync to that individual repository:

```yml
user/repo:
  - path/to/file.txt
user/repo2@develop:
  - path/to/file2.txt
```

There are multiple ways to specify which files to sync to each individual repository.

### List individual file(s)

The easiest way to sync files is the list them on a new line for each repository:

```yml
user/repo:
  - .github/workflows/build.yml
  - LICENSE
  - .gitignore
```

### Different destination path/filename(s)

Using the `dest` option you can specify a destination path in the target repo and/or change the filename for each source file:

```yml
user/repo:
  - source: workflows/build.yml
    dest: .github/workflows/build.yml
  - source: LICENSE.md
    dest: LICENSE
```

### Sync entire directories

You can also specify entire directories to sync:

```yml
user/repo:
  - source: workflows/
    dest: .github/workflows/
```

### Exclude certain files when syncing directories

Using the `exclude` key you can specify files you want to exclude when syncing entire directories (#26).

```yml
user/repo:
  - source: workflows/
    dest: .github/workflows/
    exclude: |
      node.yml
      lint.yml
```

> [!NOTE]
>
> the exclude file path is relative to the source path

### Don't replace existing file(s)

By default if a file already exists in the target repository, it will be replaced. You can change this behavior by setting the `replace` option to `false`:

```yml
user/repo:
  - source: .github/workflows/lint.yml
    replace: false
```

### Sync the same files to multiple repositories

Instead of repeating yourself listing the same files for multiple repositories, you can create a group:

```yml
group:
  repos: |
    user/repo
    user/repo1
  files:
    - source: workflows/build.yml
      dest: .github/workflows/build.yml
    - source: LICENSE.md
      dest: LICENSE
```

You can create multiple groups like this:

```yml
group:
  # first group
  - files:
      - source: workflows/build.yml
        dest: .github/workflows/build.yml
      - source: LICENSE.md
        dest: LICENSE
    repos: |
      user/repo1
      user/repo2

  # second group
  - files:
      - source: configs/dependabot.yml
        dest: .github/dependabot.yml
    repos: |
      user/repo3
      user/repo4
```

### Syncing branches

You can also sync different branches from the same or different repositories (#51). For example, a repository named `foo/bar` with branch `main`, and `sync.yml` contents:

```yml
group:
  repos: |
    foo/bar@de
    foo/bar@es
    foo/bar@fr
  files:
    - source: .github/workflows/
      dest: .github/workflows/
```

Here all files in `.github/workflows/` will be synced from the `main` branch to the branches `de`/`es`/`fr`.

## License

MIT © [Hirotomo Yamada](https://github.com/hirotomoyamada)
