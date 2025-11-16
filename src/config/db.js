import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Carga las variables del archivo .env

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {});
        console.log('Conectado a MongoDB correctamente');
    } catch (error) {
        console.error('Error al conectar con MongoDB:', error.message);
        process.exit(1); // Detiene la app si la conexión falla
    }
};

export default connectDB;