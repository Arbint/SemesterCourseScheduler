"""Find the first free TCP port in a range. Used by launch scripts."""
import socket, sys

start = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
end   = int(sys.argv[2]) if len(sys.argv) > 2 else start + 20

for p in range(start, end + 1):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("", p))
            print(p)
            sys.exit(0)
        except OSError:
            continue
print(start)  # fallback: return start even if all ports are busy
