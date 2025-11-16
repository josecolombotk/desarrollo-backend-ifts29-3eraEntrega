import bcrypt from 'bcryptjs';
import { Models } from '../models/index.js';
import jwt from 'jsonwebtoken';

const authController = {
  async register(req, res) {
    try {
      const { username, password, role, medicoId, pacienteId } = req.body;
      if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'Username, password y role son requeridos' });
      }
      if (!['Administrativo', 'Medico', 'Paciente'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Role inválido' });
      }

      const existing = await Models['usuarios'].findOne({ Username: username });
      if (existing) {
        return res.status(409).json({ success: false, message: 'El usuario ya existe' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newUser = await Models['usuarios'].create({
        Username: username,
        PasswordHash: passwordHash,
        Role: role,
        MedicoRef: medicoId || null,
        PacienteRef: pacienteId || null,
      });

      return res.status(201).json({ success: true, message: 'Usuario registrado correctamente', data: { id: newUser._id, username: newUser.Username, role: newUser.Role } });
    } catch (error) {
      console.error('Error en registro:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },
  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
      }

      const user = await Models['usuarios'].findOne({ Username: username });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      }

      const isValid = await bcrypt.compare(password, user.PasswordHash);
      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      }

      // Datos del usuario para sesión/JWT
      const userPayload = {
        id: user._id,
        username: user.Username,
        role: user.Role,
        medicoId: user.MedicoRef || null,
        pacienteId: user.PacienteRef || null,
      };

      // Guardar en la sesión (compatibilidad con vistas actuales)
      req.session.user = userPayload;

      // Generar JWT
      const token = jwt.sign(userPayload, process.env.JWT_SECRET || 'dev_jwt_secret', {
        expiresIn: '1h'
      });

      return res.status(200).json({ success: true, message: 'Inicio de sesión exitoso', data: userPayload, token });
    } catch (error) {
      console.error('Error en login:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  async logout(req, res) {
    try {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ success: false, message: 'Error al cerrar sesión' });
        }
        res.clearCookie('connect.sid');
        return res.status(200).json({ success: true, message: 'Sesión cerrada correctamente' });
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },
  async registerPacientePublic(req, res) {
    try {
      const { username, password, googleEmail, DNI, Nombre, Apellido, Edad, Sexo, ObraSocial, NroAfiliado } = req.body;
      const email = username || googleEmail;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email de usuario (username) es requerido' });
      }
      // Validar datos de paciente
      const missing = [];
      if (!DNI) missing.push('DNI');
      if (!Nombre) missing.push('Nombre');
      if (!Apellido) missing.push('Apellido');
      if (Edad === undefined || Edad === null) missing.push('Edad');
      if (!Sexo) missing.push('Sexo');
      if (!ObraSocial) missing.push('ObraSocial');
      if (!NroAfiliado) missing.push('NroAfiliado');
      if (missing.length) {
        return res.status(400).json({ success: false, message: `Faltan campos de paciente: ${missing.join(', ')}` });
      }

      // Verificar usuario existente
      const existingUser = await Models['usuarios'].findOne({ Username: email });
      if (existingUser) {
        return res.status(409).json({ success: false, message: 'El usuario ya existe' });
      }

      // Crear paciente primero
      const nuevoPaciente = await Models['pacientes'].create({ DNI, Nombre, Apellido, Edad, Sexo, ObraSocial, NroAfiliado });

      // Preparar contraseña (si viene de Google y no hay password, generar una aleatoria)
      let passwordToHash = password;
      if (!passwordToHash) {
        // Generar un password aleatorio para cuentas que usarán solo Google
        passwordToHash = Math.random().toString(36).slice(-12);
      }
      const passwordHash = await bcrypt.hash(passwordToHash, 10);

      const newUser = await Models['usuarios'].create({
        Username: email,
        PasswordHash: passwordHash,
        Role: 'Paciente',
        PacienteRef: nuevoPaciente._id,
        MedicoRef: null
      });

      return res.status(201).json({
        success: true,
        message: 'Paciente y usuario creados correctamente',
        data: {
          usuario: { id: newUser._id, username: newUser.Username, role: newUser.Role },
          paciente: { id: nuevoPaciente._id, DNI: nuevoPaciente.DNI, Nombre: nuevoPaciente.Nombre, Apellido: nuevoPaciente.Apellido }
        }
      });
    } catch (error) {
      console.error('Error en registro público de paciente:', error);
      // Manejo de errores comunes
      if (error.code === 11000) {
        // Claves duplicadas (ej.: DNI único)
        return res.status(409).json({ success: false, message: 'DNI de paciente ya existe' });
      }
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, password } = req.body;

      if (!username && !password) {
        return res.status(400).json({ success: false, message: 'Se requiere al menos un campo para actualizar (username o password)' });
      }

      const user = await Models['usuarios'].findById(id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      if (username) {
        user.Username = username;
      }

      if (password) {
        user.PasswordHash = await bcrypt.hash(password, 10);
      }

      await user.save();
      return res.status(200).json({ success: true, message: 'Usuario actualizado correctamente' });
    } catch (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const user = await Models['usuarios'].findById(id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }

      await Models['usuarios'].findByIdAndDelete(id);
      return res.status(200).json({ success: true, message: 'Usuario eliminado correctamente' });
    } catch (error) {
      console.error('Error deleting user:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  async getAllUsers(req, res) {
    try {
      const users = await Models['usuarios'].find({}, 'id Username Role');
      const formattedUsers = users.map(u => ({
        id: u._id,
        username: u.Username,
        role: u.Role
      }));
      return res.status(200).json({ success: true, data: formattedUsers });
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  }
};

export default authController;