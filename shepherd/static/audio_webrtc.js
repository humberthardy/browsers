var AudioWebRTC = function(reqid, init_params) {

    var audio = null;
    var connect_attempts = 0;
    var peer_connection;
    var ws_conn;

    init_params = init_params || {};

    var rtc_configuration = {iceServers: [{urls: "stun:stun.services.mozilla.com"},
            {urls: "stun:stun.l.google.com:19302"},

        ],
        iceTransports: 'all',
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 0
    };


    function start() {
        audio = new Audio();
        audio.autoplay = true;
        audio.play();
        websocketServerConnect()
    }

    function get_signalling_server() {
        ws_url = (window.location.protocol == "https:" ? "wss://" : "ws://");
        ws_url += window.location.hostname + ":8090"
        return ws_url
    }

    function getOurId() {
        return reqid;
    }

    // SDP offer received from peer, set remote description and create an answer
    function onIncomingSDP(sdp) {
        peer_connection.setRemoteDescription(sdp).then(() => {
                setStatus("Remote SDP set");
            if (sdp.type != "offer")
                return;
            setStatus("Got SDP offer");
            peer_connection.createAnswer()
                .then(onLocalDescription).catch(setError);
        }).catch(setError);
    }

    // Local description was set, send it to peer
    function onLocalDescription(desc) {
        console.log("Got local description: " + JSON.stringify(desc));
        peer_connection.setLocalDescription(desc).then(function() {
            setStatus("Sending SDP answer");
            sdp = {'sdp': peer_connection.localDescription}
            ws_conn.send(JSON.stringify(sdp));
        });
    }


    // ICE candidate received from peer, add it to the peer connection
    function onIncomingICE(ice) {
        var candidate = new RTCIceCandidate(ice);
        peer_connection.addIceCandidate(candidate).catch(setError);
    }

    function onServerMessage(event) {
        console.log("Received " + event.data);
        switch (event.data) {
            case "HELLO":
                setStatus("Registered with server, waiting for call");
                return;
            default:
                if (event.data.startsWith("ERROR")) {
                    handleIncomingError(event.data);
                    return;
                }
                // Handle incoming JSON SDP and ICE messages
                try {
                    msg = JSON.parse(event.data);
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        handleIncomingError("Error parsing incoming JSON: " + event.data);
                    } else {
                        handleIncomingError("Unknown error parsing response: " + event.data);
                    }
                    return;
                }

                // Incoming JSON signals the beginning of a call
                if (!peer_connection)
                    createCall(msg);

                if (msg.sdp != null) {
                    onIncomingSDP(msg.sdp);
                } else if (msg.ice != null) {
                    onIncomingICE(msg.ice);
                } else {
                    handleIncomingError("Unknown incoming JSON: " + msg);
                }
        }
    }

    function setStatus(status) {
        console.log("WebRTC-status:" + status);
    }

    function setError(error) {
        console.log("WebRTC-error: " + error);
    }


    function onServerClose(event) {
        setStatus('Disconnected from server');
        resetAudio();
        disconnectWebsocket();

        if (event.code != 1002) {
            // Reset after a second
            window.setTimeout(websocketServerConnect, 1000);
        }
    }

    function resetAudio() {
        // Reset the audio element and stop showing the last received frame
        audio.pause();
        audio.src = "";
    }

    function disconnectWebsocket() {
        if (peer_connection) {
            peer_connection.close();
            peer_connection = null;
        }
    }


    function onServerError(event) {
        setError("Unable to connect to server, did you add an exception for the certificate?")
        // Retry after 3 seconds
        window.setTimeout(websocketServerConnect, 3000);
    }

    function websocketServerConnect() {
        connect_attempts++;
        if (connect_attempts > 100) {
            setError("Too many connection attempts, aborting. Refresh page to try again");
            return;
        }

        // Fetch the peer id to use
        peer_id = getOurId();
        var ws_url = get_signalling_server();
        setStatus("Connecting to server " + ws_url + ", attempt= " + connect_attempts);
        ws_conn = new WebSocket(ws_url);
        /* When connected, immediately register with the server */
        ws_conn.addEventListener('open', (event) => {
            ws_conn.send('HELLO ' + peer_id);
                setStatus("Registering with server, peer-id = " + peer_id);
        });

        ws_conn.addEventListener('error', onServerError);
        ws_conn.addEventListener('message', onServerMessage);
        ws_conn.addEventListener('close', onServerClose);
    }

    function onRemoteTrackAdded(event) {
        audio.srcObject = event.streams[0];
    }

    function createCall(msg) {
        // Reset connection attempts because we connected successfully
        connect_attempts = 0;

        console.log('Creating RTCPeerConnection');


        peer_connection = new RTCPeerConnection(rtc_configuration);
        peer_connection.ontrack = onRemoteTrackAdded;

        /* Send our video/audio to the other peer */
        if (!msg.sdp) {
            console.log("WARNING: First message wasn't an SDP message!?");
        }

        peer_connection.onicecandidate = (event) => {
            // We have a candidate, send it to the remote party with the
            // same uuid
            if (event.candidate == null) {
                console.log("ICE Candidate was null, done");
                return;
            }
            console.log("send candidate remotely" + event.candidate.candidate);

            ws_conn.send(JSON.stringify({'ice': event.candidate}));
        };

        setStatus("Created peer connection for call, waiting for SDP");
    }

    start();

    return {
        "stop": function() {
            resetAudio();
            disconnectWebsocket();
        }
    }
};




