import threading
import time
import webview
from app_server import start_server

def run_app():
    # Start the local Flask server in a daemon thread
    server_thread = threading.Thread(target=start_server, kwargs={"port": 5000})
    server_thread.daemon = True
    server_thread.start()
    
    # Give the server a split second to bind to the port
    time.sleep(0.5)

    # Launch the native desktop window pointing to the local web app
    webview.create_window(
        "Clinic Scheduler V17", 
        "http://127.0.0.1:5000/",
        width=1400,
        height=900,
        min_size=(1024, 768)
    )
    webview.start()

if __name__ == "__main__":
    run_app()
