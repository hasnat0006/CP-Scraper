import { env } from '../env.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
async function load_single_vj_contest_name_and_scores(contest_id, contestant_ids, contestant_details) {
    const vj_handles_array = [];
    const vj_handle_to_id = {};
    contestant_ids.forEach(id => {
        if (!contestant_details?.[id]?.vj) {
            console.error("Missing VJ handle for ", id);
        }
        else {
            contestant_details?.[id]?.vj?.split(",").forEach(vj_handle => {
                vj_handle = vj_handle.trim().toLowerCase();
                vj_handles_array.push(vj_handle);
                vj_handle_to_id[vj_handle] = id;
            });
        }
    });
    const contest_scores = {};
    const unsolved_problem = {}
    contestant_ids.forEach(id => {
        contest_scores[id] = {
            points: 0,
            penalty: 0,
        };
        unsolved_problem[id] = {
            problemIds: [],
        };
    });
    const consider_score = (id, score) => {
        const prv_points = contest_scores[id].points;
        const prv_penalty = contest_scores[id].penalty;
        const new_points = score.points;
        const new_penalty = score.penalty;
        let points = prv_points;
        let penalty = prv_penalty;
        if ((prv_points < new_points) ||
            (prv_points == new_points && prv_penalty > new_penalty)) {
            points = new_points;
            penalty = new_penalty;
        }
        contest_scores[id] = { points, penalty };
    };
    try {
        let response = await axios.get('https://vjudge.net/contest/rank/single/' + contest_id, { headers: { 'cookie': 'JSESSIONID=' + env.VJ_JSESSIONID_COOKIE } });
        let res = await axios.get('https://vjudge.net/contest/' + contest_id +"#rank", { headers: { 'cookie': 'JSESSIONID=' + env.VJ_JSESSIONID_COOKIE } });
        let length = 0;
        try {
            const $ = cheerio.load(res.data);

            const element = $('td.prob-num')
            length = element.length;
            
        }
        catch (err) { 
            console.error("Failed to retrieve VJudge round " + contest_id + " standings.", err);
        }

        const { title: contest_name, length: duration_ms, participants, submissions } = response.data;
        const duration_s = parseInt(duration_ms) / 1000;
        const vj_id_to_handle = {};
        for (const participant_id in participants) {
            vj_id_to_handle[participant_id] = participants[participant_id][0].toLowerCase();
        }
        const participant_status = {};
        submissions.sort((submission1, submission2) => {
            const time_s1 = parseInt(submission1[3]);
            const time_s2 = parseInt(submission2[3]);
            return time_s1 - time_s2;
        });
        submissions.forEach((submission) => {
            const time_s = parseInt(submission[3]);
            if (time_s > duration_s)
                return;
            const handle = vj_id_to_handle[parseInt(submission[0])];
            const problem = parseInt(submission[1]);
            const status = parseInt(submission[2]);
            if (!participant_status[handle]) {
                participant_status[handle] = {};
            }
            if (!participant_status[handle][problem]) {
                participant_status[handle][problem] = {
                    solved: false,
                    penalty: 0
                };
            }
            if (!participant_status[handle][problem].solved) {
                if (status) {
                    participant_status[handle][problem].solved = true;
                    
                    if (env.CONSIDER_ONSITE_PENALTY) {
                        participant_status[handle][problem].penalty += time_s;
                    }
                    
                }
                else {
                    if (env.CONSIDER_ONSITE_PENALTY) {
                        participant_status[handle][problem].penalty += env.ONSITE_PENALTY_PER_REJECTED_ATTEMPT * 60;
                    }
                    
                }
            }
            else
            {
                
            }
        });
        for (const handle in participant_status) {
            if (!vj_handles_array.includes(handle)) {
                // console.error("Unrecognized participant " + handle + " in VJudge contest " + contest_name);
            }
        }
        const indexToChar = (index) => { 
            const quotient = Math.floor(index / 26);
            const remainder = index % 26;
            if (quotient === 0) {
                return String.fromCharCode(65 + remainder);
            }
            else {
                return String.fromCharCode(64 + quotient) + String.fromCharCode(65 + remainder);
            }
        }
        vj_handles_array.forEach(handle => {
            handle = handle.toLowerCase();
            if (participant_status[handle]) {
                const participant_score = {
                    points: 0,
                    penalty: 0
                };
                if (unsolved_problem[vj_handle_to_id[handle]])
                {
                    unsolved_problem[vj_handle_to_id[handle]].problemIds = [];
                }
                for(let i = 0; i < length; i++)
                {
                    try {
                        if (participant_status[handle][i] === undefined || participant_status[handle][i].solved === false) {
                            unsolved_problem[vj_handle_to_id[handle]].problemIds.push(indexToChar(i));
                        }
                    }
                    catch (err) {
                        
                    }
                }
                for (const problem in participant_status[handle]) {
                    // 
                    if (participant_status[handle][problem].solved) {
                        participant_score.points += env.ONSITE_PROBLEM_WEIGHT;
                        participant_score.penalty += participant_status[handle][problem].penalty;
                    }
                    
                }
                participant_score.penalty = Math.floor(participant_score.penalty / 60);
                consider_score(vj_handle_to_id[handle], participant_score);
            }
        });
        // 
        // for (const id in unsolved_problem) {
        //     
        // }
        // 
        // const str_unsolved_problem = 
        // combile all problemIds to a string
        
        const unsolved_problem_str = {};
        for (const id in unsolved_problem) {
            unsolved_problem_str[id] = unsolved_problem[id].problemIds.join(", ");
            if (unsolved_problem_str[id] === "" && contest_scores[id].points > 0) {
                unsolved_problem_str[id] = "";
            }
            else if(unsolved_problem_str[id] === "")
            {
                unsolved_problem_str[id] = "";
                for (let i = 0;i<length;i++)
                {
                    unsolved_problem_str[id] += indexToChar(i) + ", ";
                }
            }
        }
        
        return { contest_name, contest_scores, unsolved_problem_str };
    }
    catch (err) {
        console.error("Failed to retrieve VJudge round " + contest_id + " standings.", err);
        return { contest_name: "", contest_scores: {} };
    }
}
export default load_single_vj_contest_name_and_scores;
