import customtkinter as ctk
from scheduler_ui import AppUI

if __name__ == "__main__":
    ctk.set_appearance_mode("Dark")
    ctk.set_default_color_theme("blue")
    
    app = AppUI()
    app.title("Clinic Scheduler V12") # Updated Title
    app.mainloop()
