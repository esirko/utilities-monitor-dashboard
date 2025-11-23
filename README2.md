# README2 - Human-generated notes

## Development

Use a Codespace...

Copy the `.env.example` file to `.env.local` and change both 5000 ports to 5001.
This is because I have conflicts with port 5000 on my mac.

Here's my `.vscode/launch.json`
```json
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python Debugger: Python File",
            "type": "debugpy",
            "request": "launch",
            "program": "${file}",
            "python": "${workspaceFolder}/venv/bin/python",
            "envFile": "${workspaceFolder}/.env.local"
        }
    ]
}
```

Then I open `backend_server.py` and hit F5 to launch it in debug mode.
On the ports tab, port 5001 should forward to port 5001.


In a new codespace window, if you haven't already done `npm install`, do that... consider deleting `node_packages` and `package-lock.json` first.
Then `npm run build` and `npm run dev`. Forward port 5002 to 5000 so that the server can think it's on 5000 but we'll actually point the browser at http://localhost:5002 to get around the conflict I have.

I couldn't figure out why the `npm run dev` always insisted on using port 5000 instead of even 5173, which it's supposed to use by default. I noticed that doing `npm run preview` used port 4173, but then you can't debug the typescript.


## Debugging just the python backend

If you want to run the python backend and don't care about the frontend, you can use these curl commands in a client terminal.
Here I've put the `.creds.json` file in another directory because I don't want to accidentally use it in the server.
Speaking of using `.creds.json` in the server, I haven't tested the `auto_authenticate` feature in the server at all, so look at that carefully before using it, and don't create a `.creds.json` file in the main directory.

```bash
PORT=5001
login_result=$(curl -X POST -H "Content-Type: application/json" -d @../.creds.json http://localhost:$PORT/api/auth/login)
if [ $(echo $login_result | jq '.success') = "true" ]; then
  token=$(echo $login_result | jq -r '.token')
else
  echo "Login not successful" 1>&2
fi

curl http://localhost:$PORT/
curl http://localhost:$PORT/health
curl -H "Authorization: Bearer $token" http://localhost:$PORT/api/devices
curl -H "Authorization: Bearer $token" http://localhost:$PORT/api/energy/realtime
curl -H "Authorization: Bearer $token" http://localhost:$PORT/api/energy/history
```

