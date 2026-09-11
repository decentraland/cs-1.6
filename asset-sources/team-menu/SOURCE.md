# Classic CS 1.6 team menu

The layout, title icon, colors, and font sizes come from the same pinned game
mirror used by the scoreboard:

- [Teammenu.res](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/resource/UI/Teammenu.res) defines the 640×480 proportional coordinates for the title, faction buttons, auto-assign, spectator option, and Dust II briefing panel.
- [CS_logo.tga](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/gfx/vgui/CS_logo.tga) is the 64×64 title-bar silhouette. `assets/ui/cs-logo.png` is a lossless PNG conversion for SDK7.
- [de_dust2.txt](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/maps/de_dust2.txt) supplies the briefing verbatim.
- [ClientScheme.res](../scoreboard/ClientScheme.res) defines the amber text, translucent black backgrounds, borders, and Verdana font tiers.
- [800×450 visual reference](https://static.cssetti.pl/ScreenShots/portable/3.jpg) confirms that widescreen keeps a centered 4:3 coordinate area and shows Dust II briefing copy beside the team buttons.

The extra **Practice with bots** button is a scene extension required by the
solo milestone. Spectator admission is displayed in its original disabled style
until that mode is implemented.

## SHA-256

- `Teammenu.res`: `59c8eb3c66db5d16b7f8d30b8f635eb661c5d1b0e33d16f2bc6e7f0f90c0a433`
- `CS_logo.tga`: `cea5cc96747909253d034be70a5db4f8b7242b23797eeaa422f677bd5cf8b068`
- `de_dust2.txt`: `1812e8f86fb19ebfd5d9fc018a2b1c940d6ccafa98cfe0cd7362b319938290ea`
- `cs-logo.png`: `980765e4885055bc466d4f6858bb1c8e0f68078b722239c3eb6c0562cfbf30ea`
