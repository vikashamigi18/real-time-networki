// ======================================
// NETVISION - MAIN JAVASCRIPT
// ======================================

let previousData = null;
let chartReady = false;

// API helper
async function api(url) {
    const response = await fetch(url, {
        method: url === "/api/data" ? "GET" : "POST"
    });

    if (!response.ok) {
        throw new Error("Server request failed");
    }

    return response.json();
}

// ======================================
// MONITORING CONTROLS
// ======================================

async function startDemo() {
    try {
        await api("/api/start-demo");
        updateStatus("DEMO");
    } catch (error) {
        alert("Could not start demo. Check Flask server.");
    }
}

async function startLive() {
    if (!confirm("Start metadata monitoring on your authorized network?")) {
        return;
    }

    try {
        await api("/api/start-live");
        updateStatus("LIVE");
    } catch (error) {
        alert("Could not start live monitoring.");
    }
}

async function stopMonitoring() {
    try {
        await api("/api/stop");
        updateStatus("STOPPED");
    } catch (error) {
        alert("Unable to stop monitoring.");
    }
}

async function resetMonitoring() {
    try {
        await api("/api/stop");
        await api("/api/reset");
        previousData = null;
        updateStatus("STOPPED");
        refreshDashboard();
    } catch (error) {
        alert("Unable to reset dashboard.");
    }
}

function updateStatus(mode) {
    const status = document.getElementById("systemStatus");
    const label = document.getElementById("modeLabel");
    const dot = document.querySelector(".status-dot");

    status.textContent = mode;
    label.textContent = "MODE: " + mode;

    dot.style.background =
        mode === "STOPPED" ? "#ff536c" : "#36e6ac";
}

// ======================================
// CLOCK
// ======================================

function updateClock() {
    document.getElementById("clock").textContent =
        new Date().toLocaleTimeString();
}

setInterval(updateClock, 1000);
updateClock();

// ======================================
// DASHBOARD DATA
// ======================================

async function refreshDashboard() {
    try {
        const data = await api("/api/data");

        document.getElementById("totalPackets").textContent =
            data.total_packets.toLocaleString();

        document.getElementById("totalBytes").textContent =
            formatBytes(data.total_bytes);

        document.getElementById("incoming").textContent =
            data.incoming.toLocaleString();

        document.getElementById("outgoing").textContent =
            data.outgoing.toLocaleString();

        updateStatus(
            data.monitoring
                ? data.mode.toUpperCase()
                : "STOPPED"
        );

        updatePacketTable(data.packets);
        updateCharts(data);
        updateSecurity(data);

        previousData = data;

    } catch (error) {
        console.error("Dashboard update failed:", error);
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024)
        return (bytes / 1024).toFixed(2) + " KB";

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ======================================
// PACKET TABLE
// ======================================

function updatePacketTable(packets) {
    const table = document.getElementById("packetTable");

    if (!packets.length) {
        table.innerHTML =
            '<tr><td colspan="6">Waiting for network data...</td></tr>';
        return;
    }

    table.innerHTML = packets.map(packet => `
        <tr>
            <td>${escapeHTML(packet.time)}</td>
            <td>${escapeHTML(packet.source)}</td>
            <td>${escapeHTML(packet.destination)}</td>
            <td class="protocol">${escapeHTML(packet.protocol)}</td>
            <td>${Number(packet.size)} B</td>
            <td>${escapeHTML(packet.direction)}</td>
        </tr>
    `).join("");
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// ======================================
// INTERACTIVE CHARTS
// ======================================

const chartLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
        color: "#aabbd1",
        family: "Inter"
    },
    margin: {
        l: 40,
        r: 20,
        t: 20,
        b: 40
    }
};

const chartConfig = {
    responsive: true,
    displayModeBar: false
};

function updateCharts(data) {
    if (typeof Plotly === "undefined") return;

    const protocols = data.protocols || {};

    const protocolLabels = Object.keys(protocols);
    const protocolValues = Object.values(protocols);

    Plotly.react(
        "protocolChart",
        [{
            labels: protocolLabels,
            values: protocolValues,
            type: "pie",
            hole: 0.65,
            textinfo: "label+percent",
            marker: {
                colors: [
                    "#29c7ff",
                    "#9474ff",
                    "#34dfac",
                    "#ffbd63",
                    "#ff638c"
                ]
            }
        }],
        chartLayout,
        chartConfig
    );

    Plotly.react(
        "trafficChart",
        [{
            x: ["Incoming", "Outgoing"],
            y: [data.incoming, data.outgoing],
            type: "bar",
            marker: {
                color: ["#29c7ff", "#9474ff"],
                line: { width: 0 }
            }
        }],
        {
            ...chartLayout,
            yaxis: {
                gridcolor: "#25334a",
                rangemode: "tozero"
            },
            xaxis: {
                gridcolor: "#25334a"
            }
        },
        chartConfig
    );

    chartReady = true;
}

// ======================================
// SECURITY ACTIVITY MONITOR
// ======================================

function updateSecurity(data) {
    const box = document.getElementById("securityMessage");

    let title = "Activity being monitored";
    let message = "No unusual packet volume detected in this basic check.";
    let icon = "⬡";

    if (data.packets.length >= 80) {
        title = "High observed packet volume";
        message =
            "The packet display is busy. Review the traffic and investigate if unexpected.";
        icon = "⚠";
    }

    if (!data.monitoring) {
        title = "Monitoring stopped";
        message = "Start a monitoring session to observe network activity.";
        icon = "⬡";
    }

    box.innerHTML = `
        <span class="security-icon">${icon}</span>
        <div>
            <strong>${title}</strong>
            <p>${message}</p>
        </div>
    `;
}

// ======================================
// 3D NETWORK TOPOLOGY
// ======================================

let scene, camera, renderer;
let networkObjects = [];
let animationFrame;
let networkInitialized = false;

function createNetwork() {
    const container = document.getElementById("network3d");

    if (!container || typeof THREE === "undefined") {
        return;
    }

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );

    camera.position.set(0, 2, 11);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    renderer.setSize(
        container.clientWidth,
        container.clientHeight
    );

    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));

    const light = new THREE.PointLight(0x22aaff, 3, 30);
    light.position.set(0, 5, 8);
    scene.add(light);

    // Central network router

    const routerGeometry = new THREE.IcosahedronGeometry(0.85, 2);

    const routerMaterial = new THREE.MeshStandardMaterial({
        color: 0x20caff,
        emissive: 0x0874ff,
        emissiveIntensity: 1.2,
        metalness: 0.5,
        roughness: 0.25,
        wireframe: true
    });

    const router = new THREE.Mesh(
        routerGeometry,
        routerMaterial
    );

    scene.add(router);
    networkObjects.push(router);

    // Create connected network nodes

    const positions = [
        [-3, 1.8, 0],
        [3, 1.8, 0],
        [-3, -1.8, 0],
        [3, -1.8, 0],
        [0, 3, -1],
        [0, -3, -1],
        [-4, 0, -1],
        [4, 0, -1]
    ];

    const nodeColors = [
        0x38d5ff,
        0xa783ff,
        0x42e5ad,
        0x42e5ad,
        0xa783ff,
        0x38d5ff,
        0x42e5ad,
        0x38d5ff
    ];

    positions.forEach((position, index) => {

        const geometry = new THREE.SphereGeometry(
            0.19,
            32,
            32
        );

        const material = new THREE.MeshStandardMaterial({
            color: nodeColors[index],
            emissive: nodeColors[index],
            emissiveIntensity: 0.7
        });

        const node = new THREE.Mesh(geometry, material);

        node.position.set(...position);
        scene.add(node);

        networkObjects.push(node);

        // Connection lines

        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(...position)
        ];

        const lineGeometry =
            new THREE.BufferGeometry().setFromPoints(points);

        const lineMaterial = new THREE.LineBasicMaterial({
            color: nodeColors[index],
            transparent: true,
            opacity: 0.55
        });

        const line = new THREE.Line(
            lineGeometry,
            lineMaterial
        );

        scene.add(line);
        networkObjects.push(line);
    });

    // Background particles

    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = [];

    for (let i = 0; i < 250; i++) {
        particlePositions.push(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 9,
            (Math.random() - 0.5) * 8
        );
    }

    particleGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            particlePositions,
            3
        )
    );

    const particles = new THREE.Points(
        particleGeometry,
        new THREE.PointsMaterial({
            color: 0x299fff,
            size: 0.035,
            transparent: true,
            opacity: 0.7
        })
    );

    scene.add(particles);
    networkObjects.push(particles);

    networkInitialized = true;

    animateNetwork();

    window.addEventListener("resize", resizeNetwork);
}

function animateNetwork() {
    animationFrame = requestAnimationFrame(animateNetwork);

    const time = performance.now() * 0.001;

    networkObjects.forEach((object, index) => {
        if (object.type === "Mesh") {
            if (index === 0) {
                object.rotation.y += 0.006;
                object.rotation.x += 0.003;
            } else {
                object.position.y +=
                    Math.sin(time + index) * 0.0008;
            }
        }

        if (object.type === "Points") {
            object.rotation.y += 0.0005;
        }
    });

    renderer.render(scene, camera);
}

function resizeNetwork() {
    const container = document.getElementById("network3d");

    if (!renderer || !container) return;

    camera.aspect =
        container.clientWidth / container.clientHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        container.clientWidth,
        container.clientHeight
    );
}

// ======================================
// START APPLICATION
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    createNetwork();

    refreshDashboard();

    setInterval(refreshDashboard, 1500);

});
