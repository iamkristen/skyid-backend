const generate = {
  otp: () => {
    try {
      return `${Math.floor(100000 + Math.random() * 900000)}`;
    } catch (ex) {
      throw ex;
    }
  },

  generateRequestId: () => {
    const pad = (number: number) => (number < 10 ? `0${number}` : `${number}`);
    const currentDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));

    const year = currentDate.getFullYear();
    const month = pad(currentDate.getMonth() + 1);
    const day = pad(currentDate.getDate());
    const hours = pad(currentDate.getHours());
    const minutes = pad(currentDate.getMinutes());

    return `${year}${month}${day}${hours}${minutes}`;
  },
};

export default generate;
