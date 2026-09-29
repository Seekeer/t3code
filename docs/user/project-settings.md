# Customize a project icon

T3 Code selects a project icon automatically. It checks `t3.json`, common favicon and app icon
paths, and icon links in project HTML files. If it does not find an image, it chooses a built-in
emoji from the project name.

To choose a different icon or emoji:

1. Open **Settings** and select **Projects**.
2. Select the project.
3. Next to **Project icon**, select **Choose icon**.
4. Search the full Lucide icon set and choose a color, or switch to **Emoji** and choose or paste
   an emoji.

To use an image from the project instead, select **Choose file**, search for an image, and select
it.

T3 Code supports SVG, PNG, ICO, JPEG, GIF, AVIF, and WebP files. The selected path applies to
each checkout in the project group and appears on your connected clients.

To use automatic detection again, select **Automatic**.

## Keep the default branch current

Turn on **Automatically pull** in a project's settings to keep its default-branch checkout current.
T3 Code checks in the background and when the server starts. It uses the branch's configured
upstream and only performs a fast-forward pull when the checkout has no working-tree changes,
untracked files, or local commits.

The pull is skipped if the checkout is on another branch, has no upstream, or contains local work.
Pull failures do not prevent the server from starting.

## Change the folder a project points at

A project's folder is not fixed when you add it. If you move or rename the folder outside T3 Code,
or you picked the wrong directory the first time, you can point the project somewhere else.

To change it:

1. Right-click the project in the sidebar and select **Change Folder...**, or open **Settings**,
   select the project, and in the **Checkout** section select **Change folder...**.
2. Type a path or browse to the folder. Browsing lists folders on the machine that runs the
   project, so a project on a remote or tunneled environment shows that machine's folders.
3. Select **Use folder**.

Everything a project owns stays with it: its name, icon, threads, conversation history, and
per-project settings. T3 Code does not move, copy, or delete any files on disk. After a change, the
path that was replaced is offered as **Undo** on the same screen.

In a project group, each checkout has its own folder, so you change them one at a time using the
checkout selector.

The folder has to already exist. If it does not, T3 Code keeps the dialog open and explains why.

### When the folder is missing

If the folder is moved or deleted outside T3 Code, the project still appears in the sidebar and
project settings still show its last known path. Open the project's settings and the **Checkout**
section reports **Folder not found** and offers **Choose a folder...** to point the project at its
new location. Its threads and history are intact; only the path was wrong.

On mobile, press and hold the project in the project list to see its current folder and choose
**Change Folder...**.
