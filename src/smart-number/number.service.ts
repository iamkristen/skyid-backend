import SwitchTeamRequest from "../switch/switch.model";

export default class NumberService {
  static async getNumberHistory(skyId: string) {
    const numberHistory = await SwitchTeamRequest.find({ skyId });
    return numberHistory;
  }
}
