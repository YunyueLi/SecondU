export type DatingCopy = readonly [string, string];
export type DatingInterest = 'walks' | 'books' | 'cooking' | 'photography' | 'outdoors';
export const DATING_INTERESTS: {id: DatingInterest; label: DatingCopy}[] = [
  {id:'walks',label:['城市漫步','City walks']}, {id:'books',label:['阅读','Books']},
  {id:'cooking',label:['做饭','Cooking']}, {id:'photography',label:['摄影','Photography']},
  {id:'outdoors',label:['户外','Outdoors']},
];
export type DatingPerson = {
  id: string; name: DatingCopy; age: number; gender: 'women'|'men';
  city: DatingCopy; occupation: DatingCopy; introduction: DatingCopy; quote: DatingCopy;
  interests: DatingInterest[]; pace: DatingCopy; conversation: DatingCopy[]; opening: DatingCopy;
};

// Author-written fictional adults and example agent exchanges. No external matching or messaging.
export const DATING_PEOPLE: DatingPerson[] = [
  {
    id:'lin-xia',name:['林夏','Maya Lin'],age:29,gender:'women',city:['杭州','Portland'],occupation:['建筑设计师','Architect'],
    introduction:['喜欢沿河散步，也会为一家小书店绕远路。想找一个能分享日常、慢慢熟悉的人。','I take the long way for riverside walks and little bookshops. Looking for someone to share ordinary days with.'],
    quote:['“一起散步，走到哪儿聊到哪儿。”','“A long walk, with no shortage of things to say.”'],
    interests:['walks','books','photography'],pace:['先聊聊，再安排一次轻松见面。','A conversation first, then an easy first meeting.'],
    conversation:[
      ['我这边喜欢城市漫步和阅读，希望认真认识一个人，不急着安排见面。','They enjoy city walks and books, and want to get to know someone without rushing into a date.'],
      ['林夏也喜欢慢慢熟悉。她公开介绍里提到，周末会沿河散步，逛独立书店。','Maya likes to take things slowly too. Her shared introduction mentions riverside walks and independent bookshops.'],
      ['共同话题和相处节奏都合适。先把彼此推荐给本人，由他们决定要不要认识。','The shared interests and pace seem compatible. Let’s recommend them to each other and leave the decision to them.'],
    ],
    opening:['你说会为一家小书店绕远路，我很有共鸣。最近有遇到喜欢的店吗？','I liked what you said about taking the long way for a bookshop. Have you found a favorite lately?'],
  },
  {
    id:'zhou-yuan',name:['周远','Noah Reed'],age:31,gender:'men',city:['杭州','Portland'],occupation:['插画师','Illustrator'],
    introduction:['画画、做饭，偶尔背相机去陌生街区。比起安排满满的周末，更喜欢随意走走。','I draw, cook, and take my camera to unfamiliar neighborhoods. I prefer a wandering weekend to a packed schedule.'],
    quote:['“一起做晚饭，菜谱可以临时决定。”','“Let’s cook dinner. We can decide the recipe later.”'],
    interests:['cooking','photography','walks'],pace:['从共同爱好开始，不催促回应。','Start with shared interests, without pressure to reply.'],
    conversation:[
      ['我这边想认识一个能分享日常的人，喜欢散步，也愿意一起尝试新事物。','They’d like someone to share everyday life with. They enjoy walks and trying things together.'],
      ['周远的公开介绍里有摄影和做饭。他更喜欢自然地熟悉彼此，不要求随时在线。','Noah shares photography and cooking in his introduction. He prefers getting to know someone naturally, without expecting constant availability.'],
      ['可以从最近拍到的街景聊起。我会把这个建议交给本人，由他们决定下一步。','A recent street photograph could be a good starting point. I’ll pass the suggestion to them to decide what comes next.'],
    ],
    opening:['你拍陌生街区时，会先找一个目的地，还是跟着感觉走？','When you photograph a new neighborhood, do you choose a destination or just follow your curiosity?'],
  },
  {
    id:'xu-ning',name:['许宁','Clara Evans'],age:28,gender:'women',city:['杭州','Portland'],occupation:['自然教育工作者','Nature educator'],
    introduction:['会记住路边植物的名字，也喜欢待在家里读完一本书。希望生活里多一个可以分享小发现的人。','I remember the names of roadside plants and love a quiet afternoon with a book. Looking for someone to share little discoveries with.'],
    quote:['“找到一条新小路，也想告诉你。”','“When I find a new little path, I’d like to tell you.”'],
    interests:['outdoors','books','photography'],pace:['先交换日常，再决定是否进一步了解。','Share a little everyday life before deciding to go further.'],
    conversation:[
      ['我这边喜欢阅读和摄影，希望相处舒服，也尊重各自的时间。','They enjoy reading and photography, and value a comfortable pace with room for their own time.'],
      ['许宁也重视独处。她公开分享了自然观察、阅读和周末短途散步。','Clara values time to herself too. She shares nature observations, books and short weekend walks.'],
      ['两边都喜欢分享小发现，也愿意留出空间。推荐给他们看看，不替本人作决定。','Both enjoy sharing small discoveries while respecting space. Let’s offer the introduction and let them choose.'],
    ],
    opening:['最近有没有哪种路边的植物，让你忍不住停下来多看一会儿？','Has a plant by the roadside made you stop and look a little longer lately?'],
  },
  {
    id:'chen-xu',name:['陈序','Leo Brooks'],age:32,gender:'men',city:['杭州','Portland'],occupation:['图书编辑','Book editor'],
    introduction:['工作是和文字相处，休息时喜欢逛市场、试新菜。想找一个既能聊天，也能自在安静相处的人。','I work with words, then unwind at markets and in the kitchen. I value good conversation and comfortable silences.'],
    quote:['“交换一本喜欢的书，再慢慢聊。”','“Swap a favorite book, then take our time talking.”'],
    interests:['books','cooking','walks'],pace:['认真了解彼此，保留自然的节奏。','Intentional about getting to know each other, at a natural pace.'],
    conversation:[
      ['我这边希望认识同城的人，可以从阅读和周末散步开始聊。','They’d like to meet someone nearby, starting with books and weekend walks.'],
      ['陈序的公开介绍里也有这两个兴趣。他希望相处轻松，同时认真对待一段关系。','Leo shares both interests. He wants an easygoing connection while taking the relationship seriously.'],
      ['共同话题比较自然。先让双方看到推荐，再由他们决定是否继续。','There are natural shared topics. Let’s show both people the recommendation and let them decide whether to continue.'],
    ],
    opening:['如果现在交换一本书，你会带来哪一本？','If we were to swap a book today, which one would you bring?'],
  },
];
