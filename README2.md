# README2 - Human-generated notes

## Python server

### Using a codespace

The codespace isn't able to access the IP cams on the home network out of the box. There are [instructions to fix this](https://docs.github.com/en/codespaces/developing-in-a-codespace/connecting-to-a-private-network), but I couldn't get `gh net` to work, probably because it's out of support. I haven't tried the VPN yet.

Copy the `.env.example` file to `.env` and change both 5000 ports to 5001.
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
            "envFile": "${workspaceFolder}/.env"
        }
    ]
}
```

Then I open `backend_server.py` and hit F5 to launch it in debug mode.
On the ports tab, port 5001 should forward to port 5001.

### Use the local mac

This way the python server can access the IP cams. Having done the python virtual environment setup before (from the quickstart guide), do this:

```bash
source venv/bin/activate
python3 backend_server.py
```


### Debugging just the python backend

If you want to run the python backend and don't care about the frontend, you can use these curl commands in a client terminal.

```bash
PORT=5001
login_result=$(curl -X POST -H "Content-Type: application/json" -d @.creds.json http://localhost:$PORT/api/auth/login)
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


## Frontend server

Using a codespace: in a new codespace terminal , if you haven't already done `npm install`, do that... consider deleting `node_packages` and `package-lock.json` first.
Then `npm run build` and `npm run dev`. On a codespace, forward port 5002 to 5000 so that the server can think it's on 5000 but we'll actually point the browser at http://localhost:5002 to get around the conflict I have.

I couldn't figure out why the `npm run dev` always insisted on using port 5000 instead of even 5173, which it's supposed to use by default. I noticed that doing `npm run preview -- --host` used port 4173, but then you can't debug the typescript.
