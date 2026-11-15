from flask import Flask, render_template, jsonify
from packet_analyzer import PacketAnalyzer
from threading import Thread, Event
import random
import time
import socket

app = Flask(__name__)
analyzer = PacketAnalyzer()

monitoring = False
mode = "stopped"
stop_event = Event()
monitor_thread = None


def demo_monitor():
    global monitoring, mode

    protocols = ["TCP", "UDP", "ICMP", "DNS", "HTTPS"]

    while not stop_event.is_set():
        source = f"192.168.1.{random.randint(2, 254)}"
        destination = f"10.0.0.{random.randint(2, 254)}"
        protocol = random.choice(protocols)
        size = random.randint(64, 1500)
        direction = random.choice(["Incoming", "Outgoing"])

        analyzer.process_packet(
            source, destination, protocol, size, direction
        )

        stop_event.wait(random.uniform(0.3, 1.0))

    monitoring = False
    mode = "stopped"


def live_monitor():
    global monitoring, mode

    try:
        from scapy.all import sniff, IP, TCP, UDP, ICMP

        local_ips = set(
            socket.gethostbyname_ex(socket.gethostname())[2]
        )

        def handle_packet(packet):
            if IP not in packet:
                return

            ip = packet[IP]

            if TCP in packet:
                protocol = "TCP"
            elif UDP in packet:
                protocol = "UDP"
            elif ICMP in packet:
                protocol = "ICMP"
            else:
                protocol = "IP"

            if ip.dst in local_ips:
                direction = "Incoming"
            elif ip.src in local_ips:
                direction = "Outgoing"
            else:
                direction = "Observed"

            analyzer.process_packet(
                ip.src,
                ip.dst,
                protocol,
                len(packet),
                direction
            )

        sniff(
            prn=handle_packet,
            store=False,
            timeout=1,
            stop_filter=lambda packet: stop_event.is_set()
        ) if False else None

        # Short capture intervals allow the stop control to work.
        while not stop_event.is_set():
            sniff(
                prn=handle_packet,
                store=False,
                timeout=1
            )

    except Exception as error:
        print("Live monitoring error:", error)

    monitoring = False
    mode = "stopped"


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/data")
def get_data():
    data = analyzer.get_data()
    data["monitoring"] = monitoring
    data["mode"] = mode
    return jsonify(data)


@app.route("/api/start-demo", methods=["POST"])
def start_demo():
    global monitoring, mode, monitor_thread

    if not monitoring:
        stop_event.clear()
        monitoring = True
        mode = "demo"

        monitor_thread = Thread(
            target=demo_monitor,
            daemon=True
        )
        monitor_thread.start()

    return jsonify({"success": True, "mode": mode})


@app.route("/api/start-live", methods=["POST"])
def start_live():
    global monitoring, mode, monitor_thread

    if not monitoring:
        stop_event.clear()
        monitoring = True
        mode = "live"

        monitor_thread = Thread(
            target=live_monitor,
            daemon=True
        )
        monitor_thread.start()

    return jsonify({"success": True, "mode": mode})


@app.route("/api/stop", methods=["POST"])
def stop_monitoring():
    global monitoring, mode

    stop_event.set()
    monitoring = False
    mode = "stopped"

    return jsonify({"success": True})


@app.route("/api/reset", methods=["POST"])
def reset_data():
    analyzer.reset()
    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
