# Personal dev notes

## Use a Codespace

- Advantage: can use `npm run dev`
- Disadvantage: can't use IP cams

The codespace isn't able to access the IP cams on the home network out of the box. There are [instructions to fix this](https://docs.github.com/en/codespaces/developing-in-a-codespace/connecting-to-a-private-network), but I couldn't get `gh net` to work, probably because it's out of support. I haven't tried the VPN yet.

Use port 5001 in the `.env` file. This is because I have conflicts with port 5000 on my mac.

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

Forward port 5002 to 5000 so that the server can think it's on 5000 but we'll actually point the browser at http://localhost:5002 to get around the conflict I have.

I couldn't figure out why the `npm run dev` always insisted on using port 5000 instead of even 5173, which it's supposed to use by default. I noticed that doing `npm run preview -- --host` used port 4173, but then you can't debug the typescript.

## Use my local mac

- Advantage: can use IP cams
- Disadvantage: can't use `npm run dev`

This way the python server can access the IP cams. The disadvantage of using my local mac is that there's a port conflict on 5000 that I can't figure out how to resolve (in a codespace I can use port forwarding)... so I haven't been able to do `npm run dev` when devving this way.

## Debugging just the python backend

If you want to run the python backend and don't care about the frontend, you can use these curl commands in a client terminal.

```bash
PORT=5001
auth_result=$(curl -X POST -H "Content-Type: application/json" http://localhost:$PORT/api/emporia/auth)
if [ $(echo $auth_result | jq '.success') = "true" ]; then
  token=$(echo $auth_result | jq -r '.token')
else
  echo "Stored credential authentication failed" 1>&2
fi

curl http://localhost:$PORT/
curl -H "Authorization: Bearer $token" http://localhost:$PORT/api/emporia/devices
curl -H "Authorization: Bearer $token" http://localhost:$PORT/api/emporia/realtime
curl -H "Authorization: Bearer $token" "http://localhost:$PORT/api/emporia/history?range=1%20Min"
```

## pip install

I guess cv2 and pytesseract are optional here, so they're not in requirements.txt, but I can do `pip install pytesseract`, etc.
