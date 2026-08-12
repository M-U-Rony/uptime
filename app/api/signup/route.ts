import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req:NextRequest){

    const {username,password} = await req.json();

    const user = await prisma.user.findFirst({
        where:{
            username
        }
    })

    if(user){
        return NextResponse.json({error: "user lready exist"})
    }

    const newUser = await prisma.user.create({
        data:{
            username,
            password
        }
    })


    return NextResponse.json({success: true, id: newUser.id})
}