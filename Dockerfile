FROM node:18

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy server package files (since we have a postinstall script that needs it)
COPY server/package*.json ./server/

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Expose the port Hugging Face expects
EXPOSE 7860

# Start the application
CMD [ "npm", "start" ]
