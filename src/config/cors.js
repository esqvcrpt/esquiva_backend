const corsOptions = {
  origin: "*", 
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: ["Content-Type", "Authorization"],
};

export default corsOptions;