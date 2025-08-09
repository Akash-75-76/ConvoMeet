// VideoMeetComponent.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import {
  Badge,
  IconButton,
  TextField,
  CircularProgress,
  Snackbar,
  Alert,
  Button,
} from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import CallEndIcon from "@mui/icons-material/CallEnd";
import styles from "/src/styles/vedioComponent.module.css";
import server from "../envirment"; // your environment.js

const ICE_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function VideoMeetComponent({ meetingId }) {
  const localVideoRef = useRef(null);
  const socketRef = useRef(null);
  const socketIdRef = useRef(null);
  const pcsRef = useRef({}); // { remoteSocketId: RTCPeerConnection }
  const [remoteStreams, setRemoteStreams] = useState([]); // { socketId, stream }
  const [localStream, setLocalStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uiState, setUiState] = useState({
    askForUsername: true,
    username: "",
    showChat: false,
    newMessages: 0,
  });
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  // helper: attach remote stream or update existing
  const upsertRemoteStream = useCallback((socketId, stream) => {
    setRemoteStreams((prev) => {
      const existing = prev.find((p) => p.socketId === socketId);
      if (existing) {
        return prev.map((p) =>
          p.socketId === socketId ? { socketId, stream } : p
        );
      }
      return [...prev, { socketId, stream }];
    });
  }, []);

  // create and return a RTCPeerConnection for a given remote socket id
  const createPeerConnection = useCallback(
    (remoteId) => {
      if (pcsRef.current[remoteId]) return pcsRef.current[remoteId];

      const pc = new RTCPeerConnection(ICE_CONFIG);

      // send ICE candidates to remote
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit(
            "signal",
            remoteId,
            JSON.stringify({ ice: event.candidate })
          );
        }
      };

      // when remote track arrives
      pc.ontrack = (event) => {
        const stream = event.streams && event.streams[0];
        if (stream) upsertRemoteStream(remoteId, stream);
      };

      pcsRef.current[remoteId] = pc;
      return pc;
    },
    [upsertRemoteStream]
  );

  // handle incoming signals (sdp or ice)
  const handleSignal = useCallback(
    async (fromId, message) => {
      try {
        const data = JSON.parse(message);
        const pc = createPeerConnection(fromId);

        if (data.sdp) {
          const remoteDesc = new RTCSessionDescription(data.sdp);
          await pc.setRemoteDescription(remoteDesc);

          if (data.sdp.type === "offer") {
            // add local tracks if not added
            if (localStream) {
              localStream.getTracks().forEach((t) => {
                // avoid duplicate senders
                try {
                  pc.addTrack(t, localStream);
                } catch (e) {console.log(e)}
              });
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socketRef.current?.emit(
              "signal",
              fromId,
              JSON.stringify({ sdp: pc.localDescription })
            );
          }
        }

        if (data.ice) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.ice));
          } catch (err) {
            console.warn("Failed to add ICE candidates", err);
          }
        }
      } catch (err) {
        console.error("handleSignal error", err);
      }
    },
    [createPeerConnection, localStream]
  );

  // called when an existing user is in room -> we will create offer to them
  const handleNewPeer = useCallback(
    async (newPeerId) => {
      // existing peer should initiate offer to the new peer
      const pc = createPeerConnection(newPeerId);

      // add local stream tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, localStream);
          } catch (e) {console.log(e)}
        });
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit(
          "signal",
          newPeerId,
          JSON.stringify({ sdp: pc.localDescription })
        );
      } catch (err) {
        console.error("Error creating/sending offer", err);
      }
    },
    [createPeerConnection, localStream]
  );

  // when joining, server sends existing peers array — we create peer connections for them (but DO NOT create offers)
  const handleExistingPeers = useCallback(
    (peers) => {
      if (!Array.isArray(peers)) return;
      peers.forEach((peerId) => {
        // establish pc and wait for them to send offer (they will if they are existing -> they already sent offers earlier)
        createPeerConnection(peerId);
      });
    },
    [createPeerConnection]
  );

  // when remote user leaves
  const handleUserLeft = useCallback((id) => {
    const pc = pcsRef.current[id];
    if (pc) {
      try {
        pc.close();
      } catch (e) {console.log(e)}
      delete pcsRef.current[id];
    }
    setRemoteStreams((prev) => prev.filter((s) => s.socketId !== id));
  }, []);

  // connect to socket and set handlers
  const connectSocket = useCallback(() => {
    socketRef.current = io(server, { transports: ["websocket"] });

    socketRef.current.on("connect", () => {
      socketIdRef.current = socketRef.current.id;
      // join the room (use meetingId or window.location.href)
      const path = meetingId || window.location.href;
      socketRef.current.emit("join-call", path);
    });

    socketRef.current.on("existing-peers", handleExistingPeers);
    socketRef.current.on("new-peer", handleNewPeer);
    socketRef.current.on("signal", handleSignal);
    socketRef.current.on("user-left", handleUserLeft);

    socketRef.current.on("chat-message", (data, sender, socketIdSender) => {
      setMessages((prev) => [...prev, { sender, data }]);
      if (socketIdSender !== socketIdRef.current) {
        setUiState((prev) => ({ ...prev, newMessages: prev.newMessages + 1 }));
      }
    });

    socketRef.current.on("connect_error", (err) => {
      console.error("Socket connect error", err);
      setSnackbar({
        open: true,
        message: "Socket connection error",
        severity: "error",
      });
    });
  }, [
    meetingId,
    handleExistingPeers,
    handleNewPeer,
    handleSignal,
    handleUserLeft,
  ]);

  // get local media
  const startLocalMedia = useCallback(async (video = true, audio = true) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video, audio });
      setLocalStream(s);
      if (localVideoRef.current) localVideoRef.current.srcObject = s;
      setLoading(false);
      return s;
    } catch (err) {
      console.error("getUserMedia failed", err);
      setSnackbar({
        open: true,
        message: "Microphone/Camera access denied",
        severity: "error",
      });
      setLoading(false);
      throw err;
    }
  }, []);

  // start call: get media and connect socket
  const startCall = useCallback(async () => {
    if (!uiState.username.trim()) {
      setSnackbar({
        open: true,
        message: "Enter username",
        severity: "warning",
      });
      return;
    }
    setUiState((prev) => ({ ...prev, askForUsername: false }));
    await startLocalMedia(true, true);
    connectSocket();
  }, [uiState.username, startLocalMedia, connectSocket]);

  useEffect(() => {
    // cleanup on unmount
    return () => {
      Object.values(pcsRef.current).forEach((pc) => {
        try {
          pc.close();
        } catch (e) {console.log(e)}
      });
      pcsRef.current = {};
      if (socketRef.current) socketRef.current.disconnect();
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [localStream]);

  const sendMessage = useCallback(() => {
    if (!messageInput.trim()) return;
    socketRef.current?.emit("chat-message", messageInput, uiState.username);
    setMessageInput("");
  }, [messageInput, uiState.username]);

  const endCall = useCallback(() => {
    Object.values(pcsRef.current).forEach((pc) => {
      try {
        pc.close();
      } catch (e) {console.log(e)}
    });
    pcsRef.current = {};
    if (socketRef.current) socketRef.current.disconnect();
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    window.location.href = "/"; // or navigate elsewhere
  }, [localStream]);

  // UI render handling
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <CircularProgress />
        <p>Preparing...</p>
      </div>
    );
  }

  if (uiState.askForUsername) {
    return (
      <div className={styles.lobbyContainer}>
        <h2>Enter into Lobby</h2>
        <TextField
          label="Username"
          value={uiState.username}
          onChange={(e) =>
            setUiState((prev) => ({ ...prev, username: e.target.value }))
          }
          fullWidth
          margin="normal"
        />
        <Button
          variant="contained"
          onClick={startCall}
          disabled={!uiState.username.trim()}
        >
          Connect
        </Button>
        <div className={styles.previewContainer}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={styles.previewVideo}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.meetContainer}>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      {/* video grid */}
      <div className={styles.videoGrid}>
        <div className={styles.videoContainer}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={styles.videoElement}
          />
          <div className={styles.videoLabel}>You ({uiState.username})</div>
        </div>

        {remoteStreams.map(({ socketId, stream }) => (
          <RemoteVideo key={socketId} socketId={socketId} stream={stream} />
        ))}
      </div>

      {/* controls (small subset) */}
      <div className={styles.controls}>
        <IconButton
          onClick={() => {
            const enabled = localStream?.getVideoTracks()[0]?.enabled;
            if (localStream) localStream.getVideoTracks()[0].enabled = !enabled;
          }}
        >
          <VideocamIcon />
        </IconButton>

        <IconButton
          onClick={() => {
            const enabled = localStream?.getAudioTracks()[0]?.enabled;
            if (localStream) localStream.getAudioTracks()[0].enabled = !enabled;
          }}
        >
          <MicIcon />
        </IconButton>

        <IconButton
          onClick={() =>
            setUiState((prev) => ({ ...prev, showChat: !prev.showChat }))
          }
        >
          <Badge badgeContent={uiState.newMessages} color="error">
            <ChatIcon />
          </Badge>
        </IconButton>

        <IconButton onClick={endCall} style={{ color: "red" }}>
          <CallEndIcon />
        </IconButton>
      </div>

      {/* Chat */}
      {uiState.showChat && (
        <div className={styles.chatModal}>
          <div className={styles.chatMessages}>
            {messages.map((m, i) => (
              <div key={i}>
                <strong>{m.sender}: </strong>
                {m.data}
              </div>
            ))}
          </div>
          <div className={styles.chatInput}>
            <TextField
              fullWidth
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <Button onClick={sendMessage} variant="contained">
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RemoteVideo({ socketId, stream }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className={styles.videoContainer}>
      <video ref={ref} autoPlay playsInline className={styles.videoElement} />
      <div className={styles.videoLabel}>
        Participant {socketId.substring(0, 6)}
      </div>
    </div>
  );
}
