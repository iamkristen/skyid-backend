import bcrypt from "bcrypt";

export default class Bcrypt {
  private static instance: Bcrypt;

  private constructor() {}
  static shared(): Bcrypt {
    if (!Bcrypt.instance) {
      Bcrypt.instance = new Bcrypt();
    }
    return Bcrypt.instance;
  }
  encode = (value: string) => bcrypt.hashSync(value, bcrypt.genSaltSync(10));
  decode = (value: string) => bcrypt.hashSync(bcrypt.genSaltSync(10), value);
  compare = (value: string, hash: string) => bcrypt.compareSync(value, hash);
}
