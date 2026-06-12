' Launch the dev server without showing a console window.
' Note: with the console hidden, stop the app via Task Manager (node/electron)
' or by closing the Electron window plus the background node processes.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir
sh.Run "cmd /c """ & scriptDir & "\start-dev.bat""", 0, False
