from collections import Counter
from datetime import datetime
from threading import Lock

class PacketAnalyzer:
    def __init__(self):
        self.lock = Lock()
        self.packets = []
        self.protocols = Counter()
        self.total_bytes = 0
        self.total_packets = 0
        self.incoming = 0
        self.outgoing = 0

    def process_packet(self, source, destination,
                       protocol, size, direction="Incoming"):

        packet = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "source": str(source),
            "destination": str(destination),
            "protocol": str(protocol).upper(),
            "size": int(size),
            "direction": direction
        }

        with self.lock:
            self.packets.append(packet)
            self.packets = self.packets[-100:]

            self.total_packets += 1
            self.total_bytes += int(size)
            self.protocols[protocol.upper()] += 1

            if direction == "Incoming":
                self.incoming += 1
            else:
                self.outgoing += 1

    def get_data(self):
        with self.lock:
            return {
                "total_packets": self.total_packets,
                "total_bytes": self.total_bytes,
                "incoming": self.incoming,
                "outgoing": self.outgoing,
                "protocols": dict(self.protocols),
                "packets": list(reversed(self.packets))
            }

    def reset(self):
        with self.lock:
            self.packets.clear()
            self.protocols.clear()
            self.total_bytes = 0
            self.total_packets = 0
            self.incoming = 0
            self.outgoing = 0
