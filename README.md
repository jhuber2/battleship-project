# battleship-project

The two main iterations that I have chosen are:

1. New Game vs Restart Current Game with server-controlled state
    - The game can distinguish between restarting a match with the same ship placements and 
    starting a completely new game, with all state and validation managed by the server.
2. Computer fires back
    - After each player move, the server randomly selects a position on the players board to attempt 
    selecting a valid target, and then the control returns back to the player.
3. Player ship placement with validation
    - Player ship placement is shown with a preview ship model along with placement validation to ensure
    that the ship is placed within the bounds of the board

The only know limitations are that you cannot rotate the ship both clockwise and counterclockwise when trying to perform your ship placement, you can only rotate against one axis. 


+------------------------------+      HTTP fetch (GET / POST)      +------------------------------+
| Client (Browser)             | <------------------------------> | Server (Python Flask API)    |
|------------------------------|                                  |------------------------------|
| - Render UI                  |   place_ship / fire              | - Validate game rules        |
| - Preview and rotate ships   |   restart / new_game             | - Manage game state          |
| - Send user actions          |   state                          | - Send state to client       |
| - Display server updates     |                                  |                              |
| - localStorage               |                                  |                              |
|                              |                                  |                              |
|                              |                                  |                              |
+------------------------------+                                  +------------------------------+


AI Prompt Log:

Prompts:

Help me write an HTML, CSS, Javascript Web App that is locally hosted and uses localpersistence. The game I want to create is battleship. I would like a light blueish to slightly navy style backgroudn for the game. I would like the traditional battleship grid size and I would like to play the computer. I want 3 ships, one that is 3 spaces long, one that is 4 spaces long, and one that is 5 spaces long. They can be placed vertically or horizontally, but cannot intersect with other ships. I would like to play against the computer. So first, let the user place their ships (3, 4, and 5 spaces long) I would like the placement to look like translucent colors over the grid where the user wants the ship to go. Allow the user to use keys "R and L" to turn the ship to the right and left if they want to place horizontally or vertically. Make sure to check that the placements are in bounds and placements cannot be out of bounds. I then want to grids. One for the board I placed, and another for the computer I am playing against. I want to take turns playing against the computer. The computer will randomly generate areas on the board to place their ships. I wont know where they are, but I need to guess the locations on the grid. I also want two buttons to do two different things. I want one to restart the current game (so the ships stay in their same place for both the computer and the player). And I want a button to play a new game (reset the entire board, computer places new ships, and I can place my ships again). to allow for server-controlled state. When the computer fires back, have it randomly select a point on the board. I also want to use traditional hit and miss colors for battleship. This is also run using XAMPP and in my htdocs I created a file called "battleship"

EXPLANATION: This was my first prompt. Here I just wanted a basic battleship game that is locally hosted. I didn't properly look at the assignment requirements and realized I needed to go the client-server architecture route, so I decided to use Flask as my backend server while keeping the same functionality 
I had for my Client side application I produced with this prompt

Prompt: Ok lets rewrite the entire thing. I want JUST the R button to rotate the ships. BUT, I also want it so that the second I click "R" it rotates the animation right away. Right now, I have to move my cursor to a new grid point in order for it to update if that makes sense. Now give me the full updated app.js, HTML, and CSS file to do this. At the end, explain what changes were needed for the ship to update right after clicking "R"

EXPLANATION: This was my next prompt. I needed this because I wanted to change how rotating and placing ships worked since I was picky about it.

Prompt: I want to do client and server separation architecture. Can I keep the way the game behaves the exact same, using HTML, CSS, but for my backend can I use Python/Flask?

EXPLANATION: This was my next prompt since I wanted to move to a client server architecture model, which helps keep my code organized and separate, so I now managed all of my state on the server

Prompt: Can you help me draw a simple diagram that I can paste into my readme to explain the client server architecture of my project. Here is everything I want to include: Client Box for the browser. In the box, list he following tasks: - Render UI - Preview and Rotate - Communicate user actions to server - Display server updates - Storage in localStorage Then draw an arrow showing that HTTP fetch occurs over the client box to the server box, noting that post and get methods are used to perform these actions Server Box for the Python Flask API: - Validates game rules - Manages game state - Sends sate back to client

EXPLANATION: This was my last prompt, as I used this to draw my client server architecture model with my specified instructions to make the drawing process easier which I could include in my README file. 