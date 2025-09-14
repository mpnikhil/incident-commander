#!/bin/bash

# Cleanup script for old Raindrop application versions
# This will delete old incident-commander and nightrider-mvp versions to free up resources

echo "Starting cleanup of old application versions..."

# Delete old incident-commander versions
echo "Deleting old incident-commander versions..."
raindrop build delete incident-commander -v 01k4w5y2bh4ybj0n0v0hpvk7mj || echo "Failed to delete incident-commander 01k4w5y2bh4ybj0n0v0hpvk7mj"
raindrop build delete incident-commander -v 01k4w5xnhp4zx36y6wz4t8cgjv || echo "Failed to delete incident-commander 01k4w5xnhp4zx36y6wz4t8cgjv"
raindrop build delete incident-commander -v 01k4w5x9x27q8rxpyq6qxh3a4g || echo "Failed to delete incident-commander 01k4w5x9x27q8rxpyq6qxh3a4g"
raindrop build delete incident-commander -v 01k4w5w9zb2xw58smt7k8n6gr4 || echo "Failed to delete incident-commander 01k4w5w9zb2xw58smt7k8n6gr4"
raindrop build delete incident-commander -v 01k4w5vp3hs1r0v13d7p8j4vx2 || echo "Failed to delete incident-commander 01k4w5vp3hs1r0v13d7p8j4vx2"
raindrop build delete incident-commander -v 01k4w5v7c3g9s4kg3tg7jz8r6p || echo "Failed to delete incident-commander 01k4w5v7c3g9s4kg3tg7jz8r6p"
raindrop build delete incident-commander -v 01k4w5v0qf5vh5p8y1qr6kt1kx || echo "Failed to delete incident-commander 01k4w5v0qf5vh5p8y1qr6kt1kx"
raindrop build delete incident-commander -v 01k4w5tn9w3pm0ne7hp0jqrx7j || echo "Failed to delete incident-commander 01k4w5tn9w3pm0ne7hp0jqrx7j"
raindrop build delete incident-commander -v 01k4w5t4j8b8c2g6wm3e8f9tvz || echo "Failed to delete incident-commander 01k4w5t4j8b8c2g6wm3e8f9tvz"
raindrop build delete incident-commander -v 01k4w5srnvdjv4k32c6w5tn7kt || echo "Failed to delete incident-commander 01k4w5srnvdjv4k32c6w5tn7kt"
raindrop build delete incident-commander -v 01k4w5sckqey6x3nym1w4a2jh8 || echo "Failed to delete incident-commander 01k4w5sckqey6x3nym1w4a2jh8"
raindrop build delete incident-commander -v 01k4w5s7t0k9r8t9x2zzvy7apy || echo "Failed to delete incident-commander 01k4w5s7t0k9r8t9x2zzvy7apy"
raindrop build delete incident-commander -v 01k4w5s1kq0xc9k4t9t0zw5j6x || echo "Failed to delete incident-commander 01k4w5s1kq0xc9k4t9t0zw5j6x"
raindrop build delete incident-commander -v 01k4w5rt1b4j6qr4q3v7tw3p5c || echo "Failed to delete incident-commander 01k4w5rt1b4j6qr4q3v7tw3p5c"
raindrop build delete incident-commander -v 01k4w5resfwj0w5r2ynpr4m8ta || echo "Failed to delete incident-commander 01k4w5resfwj0w5r2ynpr4m8ta"
raindrop build delete incident-commander -v 01k4w5r7kqbq6k1b9xrzfm6xm4 || echo "Failed to delete incident-commander 01k4w5r7kqbq6k1b9xrzfm6xm4"
raindrop build delete incident-commander -v 01k4w5qzq1h9t3np4t8v6b8s0t || echo "Failed to delete incident-commander 01k4w5qzq1h9t3np4t8v6b8s0t"
raindrop build delete incident-commander -v 01k4w5qre71xw9r9ym5cghh1mv || echo "Failed to delete incident-commander 01k4w5qre71xw9r9ym5cghh1mv"
raindrop build delete incident-commander -v 01k4w5qj8pb6pzqy1yr0c0z5k7 || echo "Failed to delete incident-commander 01k4w5qj8pb6pzqy1yr0c0z5k7"
raindrop build delete incident-commander -v 01k4w5q9bh2jt3a8xxrtvdgk4r || echo "Failed to delete incident-commander 01k4w5q9bh2jt3a8xxrtvdgk4r"
raindrop build delete incident-commander -v 01k4w5q0yf6v7xw5gv3gcay6qd || echo "Failed to delete incident-commander 01k4w5q0yf6v7xw5gv3gcay6qd"
raindrop build delete incident-commander -v 01k4w5psdw7k2xm3r3bz3z8q2z || echo "Failed to delete incident-commander 01k4w5psdw7k2xm3r3bz3z8q2z"
raindrop build delete incident-commander -v 01k4w5pjypgjb6e4tx7h0xbz1c || echo "Failed to delete incident-commander 01k4w5pjypgjb6e4tx7h0xbz1c"
raindrop build delete incident-commander -v 01k4w5pbt2xfv6w3w6z5v5v8tc || echo "Failed to delete incident-commander 01k4w5pbt2xfv6w3w6z5v5v8tc"
raindrop build delete incident-commander -v 01k4w5p3kp2v1e9w4t8qyj5k3j || echo "Failed to delete incident-commander 01k4w5p3kp2v1e9w4t8qyj5k3j"
raindrop build delete incident-commander -v 01k4w5nwbj6pz1n1p7jtc4hd73 || echo "Failed to delete incident-commander 01k4w5nwbj6pz1n1p7jtc4hd73"

# Delete old nightrider-mvp versions (keeping the current one that's likely working)
echo "Deleting old nightrider-mvp versions..."
raindrop build delete nightrider-mvp -v 01k54160xrzbfb8f7bzj9ym81k || echo "Failed to delete nightrider-mvp 01k54160xrzbfb8f7bzj9ym81k"
raindrop build delete nightrider-mvp -v 01k540xadk7x5kjwsxkev9xz7g || echo "Failed to delete nightrider-mvp 01k540xadk7x5kjwsxkev9xz7g"
raindrop build delete nightrider-mvp -v 01k540x1nq2tch2kfz2rr4dqs3 || echo "Failed to delete nightrider-mvp 01k540x1nq2tch2kfz2rr4dqs3"
raindrop build delete nightrider-mvp -v 01k540wt5r6d1x3g8h7z5n4wtq || echo "Failed to delete nightrider-mvp 01k540wt5r6d1x3g8h7z5n4wtq"
raindrop build delete nightrider-mvp -v 01k540wkrs3v6k8y9h7z1m2nds || echo "Failed to delete nightrider-mvp 01k540wkrs3v6k8y9h7z1m2nds"
raindrop build delete nightrider-mvp -v 01k540wbg63n2kx5v8t4r9q7jp || echo "Failed to delete nightrider-mvp 01k540wbg63n2kx5v8t4r9q7jp"
raindrop build delete nightrider-mvp -v 01k540w2fz4j1n9p2k6x8q1mvr || echo "Failed to delete nightrider-mvp 01k540w2fz4j1n9p2k6x8q1mvr"
raindrop build delete nightrider-mvp -v 01k540vt9h7d5q2m8n3x6r4zwv || echo "Failed to delete nightrider-mvp 01k540vt9h7d5q2m8n3x6r4zwv"
raindrop build delete nightrider-mvp -v 01k540vkpq6n1x4r7t9z2k8fjh || echo "Failed to delete nightrider-mvp 01k540vkpq6n1x4r7t9z2k8fjh"
raindrop build delete nightrider-mvp -v 01k540vcg54k8r2x9v1n6t3qmz || echo "Failed to delete nightrider-mvp 01k540vcg54k8r2x9v1n6t3qmz"
raindrop build delete nightrider-mvp -v 01k540v3mh2v9k5r4n7x1q8tjp || echo "Failed to delete nightrider-mvp 01k540v3mh2v9k5r4n7x1q8tjp"

# Note: Keeping these essential services running:
# - billing-metric-poller (01k5008bw2yp3m7q8n4r6x9vtj)
# - model-router (01k4zmw5gk3q1n8p2r7x4v9mtj)
# - raindrop-mcp (01k4vxe5t2k9m7r3q6n1p8xvjz)
# - riverjack (01k4c7gn4m1p8q2r6x9v3k5njt)
# - nightrider-mvp (01k541s0ge6ctgctrpcbhjjesc) - current working version

echo "Cleanup completed! Resource usage should now be reduced."
echo "You can verify with: raindrop build list -a -o table"