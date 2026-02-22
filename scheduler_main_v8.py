import customtkinter as ctk
from scheduler_ui import AppUI

# V8 Wrapper
if __name__ == "__main__":
    ctk.set_appearance_mode("Dark")
    ctk.set_default_color_theme("blue")
    app = AppUI()
    app.title("Clinic Physician Scheduler Pro (v8)")
    app.mainloop()
