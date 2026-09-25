A second "🎮│Join to Create" voice channel (separate from your regular one), set up via an extended /tempvc-setup.
Joining it creates a "🎮 Game" voice channel and drops a panel in its chat with buttons for popular games + an "Other" button (opens a text box for a custom name).
Picking a game renames the channel to 🎮 <Game Name> instantly.
When it's empty, it gets deleted — reusing your existing empty-channel deletion logic, so it behaves exactly like your other temp channels (survives restarts, gets swept, etc.).
I'm keeping your emoji-nickname-sync logic untouched and just skipping it for this new channel type, so it doesn't interfere with your existing temp-VC bot at all.
