const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Disable automatic createdAt/updatedAt from Mongoose timestamps
    // since we define createdAt manually
    timestamps: false,
  }
);

module.exports = mongoose.model('Transcript', transcriptSchema);
