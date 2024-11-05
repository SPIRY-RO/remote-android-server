let socket;
let peerConnection;
let dataChannel;
let loggedInUsername;
let receivedOffer;
let targetUsername;

// Get references to DOM elements
const remoteVideo = document.getElementById("remoteVideo");
const messageContainer = document.getElementById("message-container");

let deviceScreenWidth = null;
let deviceScreenHeight = null;
let scrollSensitivity = 1.5;


let isDragging = false;
let startX, startY;
let movedX, movedY;
let dragThreshold = 5; // Set a threshold to determine if it's a drag or a click


// WebRTC configuration including TURN server
// const config = {
//     iceServers: [
//         {
//             urls: "turn:openrelay.metered.ca:443?transport=tcp", // Public TURN server
//             username: "openrelayproject",
//             credential: "openrelayproject",
//         },
//     ],
// };

const config = {
    iceServers: [
        { urls: "stun:stun.cloudflare.com:3478" }
        ,
        {
            urls: "turn:turn.cloudflare.com:3478?transport=udp",
            username: "spiry",
            credential: "web123"
        },
        {
            urls: "turn:turn.cloudflare.com:5349?transport=tcp",
            username: "spiry",
            credential: "web123"
        }
    ]
};




// Login function
function login() {
    const username = document.getElementById("username").value;
    if (!username) {
        alert("Please enter a username");
        return;
    }
    loggedInUsername = username;

    // Initialize WebSocket connection
    // socket = new WebSocket("ws://192.168.0.169:3001"); // Connect to your signaling server
    socket = new WebSocket("ws://188.245.77.22:3002"); // Connect to your signaling server
    // socket = new WebSocket("ws://168.119.60.76:3001"); // Connect to your signaling server

    socket.onopen = () => {
        // Send a sign-in request
        socket.send(
            JSON.stringify({
                type: "SignIn",
                username: loggedInUsername,
                data: null,
            })
        );
        // Show the request section and hide login section
        document.getElementById("login-container").classList.add("hidden");
        document.getElementById("request-container").classList.remove("hidden");
    };

    socket.onmessage = (message) => {
        const data = JSON.parse(message.data);

        switch (data.type) {
            case "StartStreaming":
                targetUsername = data.username;
                createOffer(targetUsername); // Create SDP offer
                break;

            case "Offer":
                // Process the offer SDP
                receivedOffer = {
                    type: "offer",
                    sdp: data.data,
                };
                targetUsername = data.username;
                document.getElementById("offer-container").classList.remove("hidden");
                break;

            case "Answer":
                // Process the answer SDP
                const sdpAnswer = new RTCSessionDescription({
                    type: "answer",
                    sdp: data.data,
                });
                peerConnection
                    .setRemoteDescription(sdpAnswer)
                    .then(() =>
                        console.log("SDP Answer successfully set as remote description.")
                    )
                    .catch((error) =>
                        console.error("Error setting remote description: ", error)
                    );
                break;

            case "IceCandidates":
                if (data.data) {
                    // Parse the ICE candidate string received from Android
                    const candidateData = JSON.parse(data.data);

                    const candidate = new RTCIceCandidate({
                        candidate: candidateData.sdp, // SDP string
                        sdpMid: candidateData.sdpMid, // SDP Media ID
                        sdpMLineIndex: candidateData.sdpMLineIndex, // SDP MLine Index
                    });

                    peerConnection
                        .addIceCandidate(candidate)
                        .then(() => console.log("ICE Candidate added successfully"))
                        .catch((error) =>
                            console.error("Error adding ICE Candidate:", error)
                        );
                }
                break;

            case "EndCall":
                closeConnection();
                break;
        }
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed");
    };

    socket.onerror = (error) => {
        console.log("WebSocket error: ", error);
    };
}

// Send StartStreaming request
function sendStartStreaming() {
    const target = document.getElementById("target").value;

    if (!target) {
        alert("Please enter a target");
        return;
    }

    targetUsername = target;

    socket.send(
        JSON.stringify({
            type: "StartStreaming",
            target: targetUsername,
            username: loggedInUsername,
        })
    );

    alert(`StartStreaming request sent to ${targetUsername}`);
}

// Accept Offer and Start Streaming
function acceptOffer() {
    document.getElementById("offer-container").classList.add("hidden");
    createPeerConnection();

    peerConnection
        .setRemoteDescription(receivedOffer)
        .then(() => {
            return peerConnection.createAnswer();
        })
        .then((answer) => {
            return peerConnection.setLocalDescription(answer);
        })
        .then(() => {
            socket.send(
                JSON.stringify({
                    type: "Answer",
                    target: targetUsername, // Send back to the caller
                    username: loggedInUsername,
                    data: peerConnection.localDescription.sdp,
                })
            );
        });
}

// Create an RTCPeerConnection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config); // Pass the TURN and STUN server configuration

    // When remote stream is received, display it
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        document.getElementById("video-container").style.display = "block";
    };

    // ICE candidates are gathered and sent to the signaling server
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(
                JSON.stringify({
                    type: "IceCandidates",
                    target: targetUsername,
                    data: event.candidate,
                })
            );
        }
    };

    // Create Data Channel (for the offerer)
    if (peerConnection.createDataChannel) {
        dataChannel = peerConnection.createDataChannel("chat");

        dataChannel.onopen = () => {
            console.log("Data channel is open");
            // Messaging UI is toggled manually
        };

        dataChannel.onmessage = (event) => {
            handleDataChannelMessage(event.data);
        };
    }

    // Handle Data Channel (for the answerer)
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;

        dataChannel.onopen = () => {
            console.log("Data channel is open");
            // Messaging UI is toggled manually
        };

        dataChannel.onmessage = (event) => {
            handleDataChannelMessage(event.data);
        };
    };

    // Add click event listener to the video after connection is established
    // remoteVideo.addEventListener("click", handleVideoClick);
    // remoteVideo.addEventListener("wheel", handleScroll);


    // Add mouse event listeners to the remoteVideo element
    remoteVideo.addEventListener("mousedown", handleMouseDown);
    remoteVideo.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
}

function handleMouseDown(event) {
    const rect = remoteVideo.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Normalize x and y to ratios
    const xRatio = x / rect.width;
    const yRatio = y / rect.height;


    const xFinal = xRatio * deviceScreenWidth;
    const yFinal = yRatio * deviceScreenHeight;


    // Record the initial coordinates when the mouse button is pressed
    startX = xFinal;
    startY = yFinal;
    isDragging = false;
}

function handleMouseMove(event) {
    // If the mouse is pressed, check if movement is enough to be considered a drag
    if (startX !== undefined && startY !== undefined) {
        movedX = event.clientX;
        movedY = event.clientY;

        // Calculate the distance moved
        const diffX = Math.abs(movedX - startX);
        const diffY = Math.abs(movedY - startY);

        // If the movement exceeds the threshold, it's a drag
        if (diffX > dragThreshold || diffY > dragThreshold) {
            isDragging = true;
        }
    }
}

function handleMouseUp(event) {
    // Mouse released, so we handle either a click or a drag
    if (isDragging) {

        const rect = remoteVideo.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Normalize x and y to ratios
        const xRatio = x / rect.width;
        const yRatio = y / rect.height;


        const xFinal = xRatio * deviceScreenWidth;
        const yFinal = yRatio * deviceScreenHeight;

        // Handle the drag operation
        movedX = xFinal;
        movedY = yFinal;



        console.log(`Drag event from (${startX}, ${startY}) to (${movedX}, ${movedY})`);

        // You can send the drag coordinates via dataChannel if needed
        const dragMessage = JSON.stringify({
            type: "drag",
            animation: 500,
            startX: startX,
            startY: startY,
            endX: movedX,
            endY: movedY,
        });

        if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(dragMessage);
            console.log("Sent drag coordinates:", dragMessage);
        }
    } else {
        // If no dragging occurred, it's a click event
        handleVideoClick(event);
    }

    // Reset coordinates and states after the mouse is released
    startX = undefined;
    startY = undefined;
    isDragging = false;
}

// Handle video click event to send x and y coordinates
function handleVideoClick(event) {
    if (!deviceScreenHeight || !deviceScreenWidth) {
        alert("Device screen dimensions not received yet");
        return;
    }

    const rect = remoteVideo.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Normalize x and y to ratios
    const xRatio = x / rect.width;
    const yRatio = y / rect.height;


    const xFinal = xRatio * deviceScreenWidth;
    const yFinal = yRatio * deviceScreenHeight;

    const message = JSON.stringify({
        type: "click",
        x: xFinal,
        y: yFinal,
    });

    if (dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(message);
        console.log("Sent click coordinates:", message);
    } else {
        console.log("Data channel is not open");
    }
}

function handleScroll(event) {
    // Determine scroll direction
    let direction = event.deltaY > 0 ? "up" : "down";

    // Get the current x and y coordinates where the scroll happened
    const x = event.clientX;
    const y = event.clientY;

    // The difference is the magnitude of the scroll (deltaY), can adjust as necessary
    const difference = Math.abs(event.deltaY * scrollSensitivity);

    // Send scroll command based on detected values
    sendScrollCommand(direction, x, y, difference);

    console.log(`Scroll detected - Direction: ${direction}, X: ${x}, Y: ${y}, Difference: ${difference}`);
}

// Handle incoming messages from the data channel
function handleDataChannelMessage(message) {
    try {
        const data = JSON.parse(message);
        if (data.type === "click") {
            console.log("Received click coordinates:", data);
        } else if (data.type === "screenDimensions") {
            // Received screen dimensions from Android
            deviceScreenWidth = data.width;
            deviceScreenHeight = data.height;
            console.log("Received device screen dimensions:", deviceScreenWidth, deviceScreenHeight);

            // Adjust video display accordingly
            adjustVideoDisplay();
            displayMessage("Received device screen dimensions:: " + message);
        } else {
            displayMessage("Peer: " + message);
        }
    } catch (e) {
        displayMessage("Peer: " + message);
    }
}

function calculateAspectRatio(
    originalWidth,
    originalHeight,
    minHeight = 500,
    maxHeight = 800,
    minWidth = 1,
    maxWidth = 800
) {
    originalWidth = parseFloat(originalWidth);
    originalHeight = parseFloat(originalHeight);
    minHeight = parseFloat(minHeight);
    maxHeight = parseFloat(maxHeight);
    minWidth = parseFloat(minWidth);
    maxWidth = parseFloat(maxWidth);

    // Step 1: Find the Greatest Common Divisor (GCD)
    function gcd(a, b) {
        return b === 0 ? a : gcd(b, a % b);
    }

    const divisor = gcd(originalWidth, originalHeight);

    // Step 2: Simplify the width and height
    let simplifiedWidth = originalWidth / divisor;
    let simplifiedHeight = originalHeight / divisor;

    // Step 3: Smart Scaling of the simplified aspect ratio
    let finalWidth = simplifiedWidth;
    let finalHeight = simplifiedHeight;

    // Determine scaling factors for height and width
    let heightScaleFactor = Math.max(minHeight / finalHeight, maxHeight / finalHeight);
    let widthScaleFactor = Math.max(minWidth / finalWidth, maxWidth / finalWidth);

    // Choose the largest scale factor to ensure both dimensions fit
    let scaleFactor = Math.max(heightScaleFactor, widthScaleFactor);

    // Multiply both width and height by the chosen scale factor to fit within bounds
    finalWidth *= scaleFactor;
    finalHeight *= scaleFactor;

    // Ensure the final height and width stay within the limits
    if (finalHeight > maxHeight) {
        finalHeight = maxHeight;
        finalWidth = (maxHeight / simplifiedHeight) * simplifiedWidth;
    } else if (finalHeight < minHeight) {
        finalHeight = minHeight;
        finalWidth = (minHeight / simplifiedHeight) * simplifiedWidth;
    }

    if (finalWidth > maxWidth) {
        finalWidth = maxWidth;
        finalHeight = (maxWidth / simplifiedWidth) * simplifiedHeight;
    } else if (finalWidth < minWidth) {
        finalWidth = minWidth;
        finalHeight = (minWidth / simplifiedWidth) * simplifiedHeight;
    }

    // Return the final width and height in the correct aspect ratio
    return { width: Math.round(finalWidth), height: Math.round(finalHeight) };
}

function viewportToPixels(value, unit) {
    let result;

    // Convert vh to pixels
    if (unit === 'vh') {
        const viewportHeight = window.innerHeight;
        result = (value / 100) * viewportHeight;
    }
    // Convert vw to pixels
    else if (unit === 'vw') {
        const viewportWidth = window.innerWidth;
        result = (value / 100) * viewportWidth;
    } else {
        throw new Error('Unit must be either "vh" or "vw".');
    }

    return result;
}


function adjustVideoDisplay() {
    if (deviceScreenWidth && deviceScreenHeight) {
        let minHeight = viewportToPixels(60, 'vh');
        let maxHeight = viewportToPixels(90, 'vh');
        const aspectRatio = calculateAspectRatio(
            deviceScreenWidth,
            deviceScreenHeight,
            minHeight,
            maxHeight);
        const videoContainer = document.querySelector('.mobile-frame');

        // videoContainer.style.width = `${maxWidth}px`;
        // videoContainer.style.height = `${maxHeight}px`;

        // Ensure the video element fills the container
        remoteVideo.style.width = `${aspectRatio.width}px`;
        remoteVideo.style.height = `${aspectRatio.height}px`;
    }
}





function sendScrollCommand(direction = "up", x = 500, y = 1500, difference = 500) {
    const message = JSON.stringify({
        type: "scroll",
        direction,
        x,
        y,
        difference
    });

    if (dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(message);
        console.log("Sent scroll command:", message);
    } else {
        console.log("Data channel is not open");
    }
}



// Create an SDP Offer and send it
function createOffer(target) {
    createPeerConnection();

    peerConnection
        .createOffer({
            offerToReceiveVideo: true, // Ensure that the offer is for receiving video
        })
        .then((offer) => {
            return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            // Once local description is set, send the SDP offer to the WebSocket server
            socket.send(
                JSON.stringify({
                    type: "Offer",
                    target: target, // Target device (e.g., android, mac)
                    username: loggedInUsername, // Your username
                    data: peerConnection.localDescription.sdp, // SDP offer
                })
            );
        })
        .catch((error) => {
            console.error("Error creating or sending offer: ", error);
        });
}

// Send message via Data Channel
function sendMessage() {
    const messageInput = document.getElementById("message-input");
    const message = messageInput.value;
    if (message && dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(message);
        displayMessage("You: " + message);
        messageInput.value = "";
    } else {
        alert("Data channel is not open");
    }
}

// Display message in the message display area
function displayMessage(message) {
    const messageDisplay = document.getElementById("message-display");
    const messageElement = document.createElement("div");
    messageElement.textContent = message;
    messageDisplay.appendChild(messageElement);
    messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

// Toggle Message Container
function toggleMessageContainer() {
    if (messageContainer.classList.contains("hidden")) {
        messageContainer.classList.remove("hidden");
    } else {
        messageContainer.classList.add("hidden");
    }
}

// Close the connection
function closeConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    document.getElementById("remoteVideo").srcObject = null;
    document.getElementById("video-container").style.display = "none";
    messageContainer.classList.add("hidden");
}

// Ensure that the message toggle function is in the global scope
window.toggleMessageContainer = toggleMessageContainer;

window.onunload = window.onbeforeunload = () => {
    if (socket) {
        socket.close();
    }
    closeConnection();
};
