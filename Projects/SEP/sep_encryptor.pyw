import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import customtkinter as ctk
import os
import sep_crypto

ctk.set_appearance_mode("Dark")  # Enforce Dark mode for the Cyberpunk theme
ctk.set_default_color_theme("blue")  # Themes: "blue" (standard), "green", "dark-blue"

STRATEGIES = [
	"Double Layer: SEP + AES (Requires Password & Key)",
	"Double Layer: SEP + AES (Requires Password Only)",
	"SEP Layer Only (Requires Key File)",
	"SEP Layer Only (Requires Password)",
	"AES Layer Only (Requires Password)"
]

class SepCryptoApp:
	def __init__(self, root):
		self.root = root
		self.root.title("SEP Encryptor/Decryptor Advanced")
		self.root.geometry("600x750")
		self.root.resizable(False, False)
		self.root.configure(fg_color="#050510") # Midnight blue bg
		
		# State Variables
		self.files = []
		self.key_bytes = None
		self.strategy_var = ctk.StringVar(value=STRATEGIES[1])
		self.rename_var = ctk.StringVar()
		self.dual_pass_var = ctk.BooleanVar(value=False)
		self.pwd_sep_var = ctk.StringVar()
		self.pwd_aes_var = ctk.StringVar()
		
		self.create_widgets()
		self.update_ui()
		
	def create_widgets(self):
		# Main Title Header
		lbl_title = ctk.CTkLabel(self.root, text="SEP Encryptor", font=ctk.CTkFont(size=28, weight="bold"), text_color="#22d3ee")
		lbl_title.pack(pady=(20, 5))

		# 1. File Selection Frame
		frame_file = ctk.CTkFrame(self.root, fg_color="#111827", border_width=1, border_color="#0891b2", corner_radius=15)
		frame_file.pack(fill=tk.X, padx=20, pady=10)
		ctk.CTkLabel(frame_file, text="1. Select Input File(s)", font=ctk.CTkFont(weight="bold"), text_color="#a5f3fc").pack(anchor='w', padx=10, pady=(10, 0))
		
		self.lbl_files = ctk.CTkLabel(frame_file, text="No files selected.", text_color="#9ca3af")
		self.lbl_files.pack(anchor='w', padx=10, pady=(0, 5))
		ctk.CTkButton(frame_file, text="Browse Files", command=self.browse_files, fg_color="#082f49", border_color="#22d3ee", border_width=2, text_color="#22d3ee", hover_color="#0e7490").pack(anchor='w', padx=10, pady=(0, 10))
		
		rename_frame = ctk.CTkFrame(frame_file, fg_color="transparent")
		rename_frame.pack(fill=tk.X, padx=10, pady=(0, 10))
		ctk.CTkLabel(rename_frame, text="Rename Output (Optional):", text_color="#22d3ee").pack(side=tk.LEFT)
		ctk.CTkEntry(rename_frame, textvariable=self.rename_var, width=250, fg_color="#082f49", border_color="#0891b2", text_color="#cffafe").pack(side=tk.LEFT, padx=10)
		
		# 2. Strategy Frame
		frame_strat = ctk.CTkFrame(self.root, fg_color="#111827", border_width=1, border_color="#0891b2", corner_radius=15)
		frame_strat.pack(fill=tk.X, padx=20, pady=10)
		ctk.CTkLabel(frame_strat, text="2. Encryption Strategy", font=ctk.CTkFont(weight="bold"), text_color="#a5f3fc").pack(anchor='w', padx=10, pady=(10, 5))
		
		self.strategy_combo = ctk.CTkOptionMenu(frame_strat, variable=self.strategy_var, values=STRATEGIES, command=self.update_ui, width=450, fg_color="#082f49", button_color="#0891b2", button_hover_color="#22d3ee", text_color="#cffafe")
		self.strategy_combo.pack(anchor='w', padx=10, pady=(0, 10))
		
		# 3. Credentials Frame
		self.frame_cred = ctk.CTkFrame(self.root, fg_color="#111827", border_width=1, border_color="#0891b2", corner_radius=15)
		self.frame_cred.pack(fill=tk.X, padx=20, pady=10)
		ctk.CTkLabel(self.frame_cred, text="3. Credentials", font=ctk.CTkFont(weight="bold"), text_color="#a5f3fc").pack(anchor='w', padx=10, pady=(10, 5))
		
		# Key File Sub-frame
		self.frame_key = ctk.CTkFrame(self.frame_cred, fg_color="transparent")
		self.lbl_key_status = ctk.CTkLabel(self.frame_key, text="Current Key: Not loaded", text_color="#ef4444")
		self.lbl_key_status.pack(side=tk.LEFT, padx=10)
		ctk.CTkButton(self.frame_key, text="Generate Key", command=self.generate_key, width=120, fg_color="#082f49", border_color="#22d3ee", border_width=1, text_color="#22d3ee", hover_color="#0e7490").pack(side=tk.RIGHT, padx=10)
		ctk.CTkButton(self.frame_key, text="Load Key", command=self.load_key, width=120, fg_color="#082f49", border_color="#22d3ee", border_width=1, text_color="#22d3ee", hover_color="#0e7490").pack(side=tk.RIGHT)
		
		# Password Sub-frame
		self.frame_pwd = ctk.CTkFrame(self.frame_cred, fg_color="transparent")
		self.chk_dual = ctk.CTkCheckBox(self.frame_pwd, text="Use different passwords for SEP and AES", variable=self.dual_pass_var, command=self.update_ui, text_color="#a5f3fc", border_color="#0891b2", fg_color="#22d3ee", hover_color="#06b6d4")
		
		self.lbl_pwd_1 = ctk.CTkLabel(self.frame_pwd, text="Password:", text_color="#22d3ee")
		self.ent_pwd_1 = ctk.CTkEntry(self.frame_pwd, textvariable=self.pwd_aes_var, show="*", width=300, fg_color="#082f49", border_color="#0891b2", text_color="#cffafe")
		
		self.lbl_pwd_2 = ctk.CTkLabel(self.frame_pwd, text="SEP Password:", text_color="#22d3ee")
		self.ent_pwd_2 = ctk.CTkEntry(self.frame_pwd, textvariable=self.pwd_sep_var, show="*", width=300, fg_color="#082f49", border_color="#0891b2", text_color="#cffafe")
		
		# 4. Actions Frame
		frame_actions = ctk.CTkFrame(self.root, fg_color="transparent")
		frame_actions.pack(fill=tk.X, padx=20, pady=20)
		
		ctk.CTkButton(frame_actions, text="Encrypt", command=lambda: self.process_files("encrypt"), height=40, font=ctk.CTkFont(weight="bold"), fg_color="#082f49", border_color="#22d3ee", border_width=2, text_color="#22d3ee", hover_color="#0e7490").pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
		ctk.CTkButton(frame_actions, text="Decrypt", command=lambda: self.process_files("decrypt"), height=40, font=ctk.CTkFont(weight="bold"), fg_color="#082f49", border_color="#22d3ee", border_width=2, text_color="#22d3ee", hover_color="#0e7490").pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=5)
		
		self.lbl_status = ctk.CTkLabel(self.root, text="Ready", text_color="#9ca3af", font=ctk.CTkFont(weight="bold"))
		self.lbl_status.pack(pady=10)

	def browse_files(self):
		selected = filedialog.askopenfilenames(title="Select File(s)")
		if selected:
			self.files = list(selected)
			self.lbl_files.configure(text=f"{len(self.files)} file(s) selected.", text_color="#cffafe")

	def generate_key(self):
		filename = filedialog.asksaveasfilename(defaultextension=".sep", title="Save New Key File")
		if filename:
			new_key = sep_crypto.get_crypto_random(1024)
			with open(filename, 'wb') as f:
				f.write(new_key)
			self.key_bytes = new_key
			self.lbl_key_status.configure(text="Current Key: Loaded (Generated)", text_color="#22c55e")
			messagebox.showinfo("Success", "New key generated and loaded.")

	def load_key(self):
		filename = filedialog.askopenfilename(title="Select Key File")
		if filename:
			with open(filename, 'rb') as f:
				self.key_bytes = f.read()
			if len(self.key_bytes) != 1024:
				messagebox.showwarning("Warning", "Key file is not exactly 1024 bytes. Encryption may fail.")
			self.lbl_key_status.configure(text="Current Key: Loaded from file", text_color="#22c55e")

	def update_ui(self, *args):
		strat = self.strategy_var.get()
		
		# Reset visibility
		self.frame_key.pack_forget()
		self.frame_pwd.pack_forget()
		self.chk_dual.pack_forget()
		self.lbl_pwd_1.pack_forget()
		self.ent_pwd_1.pack_forget()
		self.lbl_pwd_2.pack_forget()
		self.ent_pwd_2.pack_forget()

		# Key Visibility
		if "Key" in strat:
			self.frame_key.pack(fill=tk.X, pady=10, padx=10)

		# Password Visibility
		if "Password" in strat:
			self.frame_pwd.pack(fill=tk.X, pady=5, padx=10)
			
			if strat == "Double Layer: SEP + AES (Requires Password Only)":
				self.chk_dual.pack(anchor='w')
				if self.dual_pass_var.get():
					self.lbl_pwd_1.configure(text="AES Password:")
					self.lbl_pwd_1.pack(anchor='w', pady=(5,0))
					self.ent_pwd_1.pack(anchor='w')
					self.lbl_pwd_2.pack(anchor='w', pady=(5,0))
					self.ent_pwd_2.pack(anchor='w')
				else:
					self.lbl_pwd_1.configure(text="Master Password:")
					self.lbl_pwd_1.pack(anchor='w', pady=(5,0))
					self.ent_pwd_1.pack(anchor='w')
			else:
				self.lbl_pwd_1.configure(text="Password:")
				self.lbl_pwd_1.pack(anchor='w', pady=(5,0))
				self.ent_pwd_1.pack(anchor='w')

	def execute_crypto_routine(self, data, ext, mode, strat, pwd_aes, pwd_sep):
		# ---------------- ENCRYPTION ---------------- #
		if mode == "encrypt":
			if strat == "AES Layer Only (Requires Password)":
				return sep_crypto.encrypt_aes(data, pwd_aes), ".enc"
				
			# SEP Layer processing
			compressed = sep_crypto.compress_data(data)
			salt = sep_crypto.get_crypto_random(16)
			packed = sep_crypto.pack_sep1(compressed, ext)
			
			if "Key File" in strat or "Password & Key" in strat:
				xor_key = self.key_bytes
			else:
				xor_key = sep_crypto.create_key_from_password(pwd_sep, 1024, salt)
				
			encrypted_sep = sep_crypto.process_xor(packed, xor_key)
			out_data = salt + encrypted_sep
			
			# AES Layer wrapper if Double Layer
			if "AES" in strat:
				out_data = sep_crypto.encrypt_aes(out_data, pwd_aes)
				
			return out_data, ".enc"

		# ---------------- DECRYPTION ---------------- #
		else:
			if strat == "AES Layer Only (Requires Password)":
				return sep_crypto.decrypt_aes(data, pwd_aes), ""
				
			if "AES" in strat:
				data = sep_crypto.decrypt_aes(data, pwd_aes)
				
			if len(data) < 16:
				raise ValueError("SEP Decryption failed! Corrupted data or missing salt.")
				
			salt = data[:16]
			cipher = data[16:]
			
			if "Key File" in strat or "Password & Key" in strat:
				xor_key = self.key_bytes
			else:
				xor_key = sep_crypto.create_key_from_password(pwd_sep, 1024, salt)
				
			unpacked = sep_crypto.process_xor(cipher, xor_key)
			res = sep_crypto.unpack_sep1(unpacked)
			
			return sep_crypto.decompress_data(res["data"]), res["ext"]

	def process_files(self, mode):
		if not self.files:
			messagebox.showwarning("Error", "Please select at least one file.")
			return
			
		strat = self.strategy_var.get()
		pwd_aes = self.pwd_aes_var.get()
		pwd_sep = self.pwd_sep_var.get() if self.dual_pass_var.get() else pwd_aes
		
		# Validation checks
		if "Key" in strat and not self.key_bytes:
			messagebox.showerror("Error", "This strategy requires a loaded Key File.")
			return
		if "Password" in strat and not pwd_aes:
			messagebox.showerror("Error", "This strategy requires a password.")
			return

		self.lbl_status.configure(text=f"{mode.capitalize()}ing {len(self.files)} file(s)...", text_color="#22d3ee")
		self.root.update()
		
		success_count = 0
		
		try:
			for idx, filepath in enumerate(self.files):
				with open(filepath, 'rb') as f:
					raw_data = f.read()
					
				ext = os.path.splitext(filepath)[1]
				
				# Execute mapped strategy logic
				result_data, out_ext = self.execute_crypto_routine(raw_data, ext, mode, strat, pwd_aes, pwd_sep)
				
				# Formulate Output Path
				dir_name = os.path.dirname(filepath)
				base_name = os.path.splitext(os.path.basename(filepath))[0]
				
				# Apply custom renaming if provided
				if self.rename_var.get().strip():
					base_name = self.rename_var.get().strip()
					if len(self.files) > 1:
						base_name += f"_{idx+1}"
						
				# Handle extensions intelligently based on mode
				if mode == "encrypt":
					out_path = os.path.join(dir_name, base_name + out_ext)
				else:
					if filepath.endswith(".enc") or filepath.endswith(".sep") or filepath.endswith(".aes"):
						out_path = os.path.join(dir_name, base_name + out_ext)
					else:
						out_path = os.path.join(dir_name, base_name + "_decrypted" + out_ext)
						
					# Collision prevention
					if os.path.exists(out_path):
						out_path = out_path.replace(out_ext, f"_decrypted{out_ext}")

				with open(out_path, 'wb') as f:
					f.write(result_data)
				success_count += 1
				
			self.lbl_status.configure(text=f"Success: {success_count}/{len(self.files)} file(s) processed.", text_color="#22c55e")
			messagebox.showinfo("Complete", f"Successfully processed {success_count} file(s).")
			
		except Exception as e:
			self.lbl_status.configure(text="Operation Failed", text_color="#ef4444")
			messagebox.showerror("Error", f"Failed during {mode}:\n{str(e)}")

if __name__ == "__main__":
	root = ctk.CTk()
	app = SepCryptoApp(root)
	root.mainloop()
